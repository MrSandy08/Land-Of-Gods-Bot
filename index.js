const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  jidDecode
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const express = require('express');
const connectDB = require('./src/database');
const User = require('./src/models/User');
const Config = require('./src/models/Config');
const Group = require('./src/models/Group');
const handleCommand = require('./src/commands');
const { useMongoAuthState, clearCreds } = require('./src/mongoAuth');
const moment = require('moment');
const fmt = require('./format');

// Anti-spam state
const spamState = new Map();

// Variable para guardar el código de vinculación
let pairingCode = "Esperando código...";

// Servidor Express ultra ligero para hosting (Render, Railway, etc.)
// Se inicia ANTES de cualquier otra cosa para evitar SIGTERM
const app = express();
const PORT = process.env.PORT || 7860;

app.get('/', (req, res) => {
  res.send(`Mini-Beyonder está en línea y procesando el multiverso 🌌\n\nCódigo de vinculación: ${pairingCode}`);
});

app.listen(PORT, () => {
  console.log(`[SERVER] Puerto web activado correctamente en el puerto ${PORT}`);
});

// Función para procesar excusas diariamente
const dailyJob = async (sock) => {
  console.log('Ejecutando job diario...');
  const users = await User.find({ 'excusa.activa': true });
  for (let u of users) {
    if (moment().isAfter(moment(u.excusa.fin))) {
      u.excusa.activa = false;
      await u.save();
    }
  }
};

async function startBot() {

  try {
    await connectDB();
  } catch (err) {
    console.error('Error al conectar a la base de datos:', err);
    pairingCode = "Error de base de datos. Revisa MONGO_URI.";
  }

  const { state, saveCreds } = await useMongoAuthState('mini-beyonder-session');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false, // Desactivamos QR
    auth: state,
    browser: ["Ubuntu", "Chrome", "20.0.04"], // Necesario para Pairing Code
    getMessage: async (key) => {
      return { conversation: 'sua-bot' };
    }
  });

  // Programar job diario (cada 24h)
  setInterval(() => dailyJob(sock), 24 * 60 * 60 * 1000);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    console.log('Actualización de conexión:', connection);
    
    if (qr) qrcode.generate(qr, { small: true });
    
    if (connection === 'close') {
      console.log('Conexión cerrada. Detalles del error:', lastDisconnect);
      
      let shouldReconnect = true;
      let clearOldCreds = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      
      if (statusCode === 403) {
        shouldReconnect = false;
        console.log('No se reconectará: cierre de sesión intencional (403)');
      } else if (statusCode === 401) {
        console.log('Error 401 detectado: borramos credenciales antiguas y reiniciamos...');
        clearOldCreds = true;
      } else {
        console.log('Intentando reconectar en 2 segundos... (Código de error:', statusCode, ')');
      }
      
      if (shouldReconnect) {
        if (clearOldCreds) {
          await clearCreds('mini-beyonder-session');
        }
        setTimeout(() => startBot(), 2000);
      }
    } else if (connection === 'open') {
      console.log('✅ Bot conectado correctamente');
      pairingCode = "Bot ya está vinculado ✅";
      
      // Lógica para solicitar Pairing Code si no hay sesión
      if (!sock.authState.creds.registered) {
        console.log('No hay sesión registrada, solicitando pairing code...');
        const phoneNumber = process.env.PHONE_NUMBER;
        if (phoneNumber) {
          try {
            console.log('Solicitando pairing code para número:', phoneNumber);
            let code = await sock.requestPairingCode(phoneNumber);
            pairingCode = code?.match(/.{1,4}/g)?.join("-") || code;
            console.log(`✅ CÓDIGO DE VINCULACIÓN: ${pairingCode}`);
          } catch (err) {
            console.error("❌ Error solicitando pairing code:", err);
            pairingCode = "Error al generar código. Verifica el número de teléfono.";
          }
        } else {
          pairingCode = "Falta PHONE_NUMBER en las variables de entorno.";
          console.log(pairingCode);
        }
      }
    }
  });

  // Evento: Participantes del grupo cambian (entrada/salida/expulsión)
  sock.ev.on('group-participants.update', async (anu) => {
    try {
      const { id, participants, action } = anu;
      
      // Registrar grupo si no existe
      await Group.findOneAndUpdate({ _id: id }, { _id: id }, { upsert: true });

      for (let num of participants) {
        if (action === 'remove') {
          // Auto-Despido / Salida de la comunidad
          const user = await User.findById(num);
          if (user && user.personaje) {
            const char = user.personaje;
            const fandom = user.fandom;
            
            // Liberar personaje
            user.personaje = null;
            user.fandom = null;
            await user.save();

            // Notificar en el grupo actual
            const text = fmt.header('Notificación de Salida') + '\n' +
                         fmt.aviso(`El usuario @${num.split('@')[0]} ha dejado el grupo/comunidad.\n\nEl personaje *${char}* (${fandom}) queda *LIBRE*.`);
            
            await sock.sendMessage(id, { text, mentions: [num] });
            
            // Notificar a todos los demás grupos (Comunidad)
            const groups = await Group.find({ _id: { $ne: id } });
            for (let g of groups) {
              await sock.sendMessage(g._id, { text }).catch(() => null);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error en group-participants.update:', err);
    }
  });

  sock.ev.on('messages.upsert', async (chatUpdate) => {
    try {
      const m = chatUpdate.messages[0];
      if (!m.message) return;
      if (m.key.fromMe) return;

      const remoteJid = m.key.remoteJid;
      const sender = m.key.participant || remoteJid;
      const isGroup = remoteJid.endsWith('@g.us');

      // Registrar grupo si es un mensaje de grupo
      if (isGroup) {
        await Group.findOneAndUpdate({ _id: remoteJid }, { _id: remoteJid }, { upsert: true });
      }
      const body = m.message.conversation || m.message.extendedTextMessage?.text || '';
      const prefix = '!';
      const isCommand = body.startsWith(prefix);

      // 1. Activity Tracking & Database Update
      let user = await User.findById(sender);
      if (!user) {
        user = new User({ _id: sender });
      }
      user.mensajes += 1;
      user.lastSeen = new Date();
      await user.save();

      // 2. Anti-spam Check
      const config = await Config.findOne({ _id: 'global' }) || await Config.create({ _id: 'global' });
      if (config.antispam.enabled) {
        const now = Date.now();
        const userSpam = spamState.get(sender) || [];
        const recentMessages = userSpam.filter(timestamp => now - timestamp < config.antispam.seconds * 1000);
        
        recentMessages.push(now);
        spamState.set(sender, recentMessages);

        if (recentMessages.length > config.antispam.limit) {
          // Detectado spam
          // Opcional: silenciar o advertir. El usuario pidió que el sistema antispam detecte.
          // Por ahora solo ignoramos el comando si es spam.
          return;
        }
      }

      // 3. Handle Commands
      if (isCommand) {
        const args = body.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        await handleCommand(sock, m, command, args, user, config);
      }

    } catch (err) {
      console.error('Error en messages.upsert:', err);
    }
  });
}

startBot();

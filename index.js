const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  Browsers,
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
const moment = require('moment');
const fmt = require('./format');
const fs = require('fs');
const path = require('path');

// Definimos la carpeta local de la sesión
const authFolder = path.join(__dirname, 'auth_info_baileys');

// Anti-spam state
const spamState = new Map();

// Variable para guardar el código de vinculación
let pairingCode = "Esperando código...";
let isPairingInProgress = false;

// Servidor Express ultra ligero para hosting (Render, Railway, etc.)
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
  try {
    const users = await User.find({ 'excusa.activa': true });
    for (let u of users) {
      if (moment().isAfter(moment(u.excusa.fin))) {
        u.excusa.activa = false;
        await u.save();
      }
    }
  } catch (err) {
    console.error('Error en el job diario:', err);
  }
};

async function startBot() {
  try {
    await connectDB();
  } catch (err) {
    console.error('Error al conectar a la base de datos:', err);
    pairingCode = "Error de base de datos. Revisa MONGO_URI.";
    return; // Detener inicio si no hay base de datos
  }

  console.log("Iniciando bot con sesión local estándar...");

  // 1. Inicializa las credenciales en la carpeta local
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.ubuntu('Chrome'), // Forma nativa y actualizada de Baileys para el bropwser
    getMessage: async (key) => {
      // Retornar un mensaje vacío ayuda a mitigar algunos errores de desencriptación (Bad MAC)
      return { conversation: 'sua-bot' };
    }
  });

  // Programar job diario (cada 24h)
  setInterval(() => dailyJob(sock), 24 * 60 * 60 * 1000);

  // 2. Escucha de eventos de conexión
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'connecting') {
      console.log('Conectando con WhatsApp...');
    }

    if (connection === 'open') {
      console.log('¡Bot conectado y listo!');
      isPairingInProgress = false;
      pairingCode = "Bot ya está vinculado ✅";
    }

    // Lógica para el Código de Vinculación
    if (connection === 'connecting' && !sock.authState.creds.registered && !isPairingInProgress) {
      isPairingInProgress = true;
      const phoneNumber = process.env.PHONE_NUMBER;
      if (phoneNumber) {
        try {
          console.log('Solicitando pairing code para número:', phoneNumber);
          // Esperar 4 segundos para asegurar estabilidad del WebSocket
          await new Promise(resolve => setTimeout(resolve, 4000));
          let code = await sock.requestPairingCode(phoneNumber);
          pairingCode = code?.match(/.{1,4}/g)?.join("-") || code;
          console.log(`\n====================================`);
          console.log(`TU CÓDIGO DE VINCULACIÓN: ${pairingCode}`);
          console.log(`====================================\n`);
          console.log('⚠️ Por favor, usa este código en WhatsApp en los próximos 60 segundos...');
        } catch (err) {
          console.error("❌ Error solicitando pairing code:", err);
          isPairingInProgress = false;
          pairingCode = "Error al generar código. Reintenta en unos segundos.";
        }
      } else {
        isPairingInProgress = false;
        pairingCode = "Falta PHONE_NUMBER en las variables de entorno.";
        console.log(pairingCode);
      }
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log(`Conexión cerrada. Razón de Baileys: ${reason}`);

      // Si es un error de desvinculación (401), cierre de sesión o error crítico 515 sin estar logueados
      if (reason === DisconnectReason.loggedOut || reason === 401 || (reason === 515 && !state.creds.registered)) {
        console.log('Sesión inválida, corrupta o rechazada por el servidor. Limpiando caché local...');
        
        if (fs.existsSync(authFolder)) {
          fs.rmSync(authFolder, { recursive: true, force: true });
        }
        
        console.log('🛑 Proceso detenido para evitar bucles. Por favor, ejecuta de nuevo "npm start" de forma limpia.');
        process.exit(1); // Detiene el bot por completo de forma controlada
      } else {
        // Errores de red comunes (timeout, caídas de internet transitorias)
        console.log('Desconexión temporal de red, intentando reconectar en 7 segundos...');
        isPairingInProgress = false;
        setTimeout(() => startBot(), 7000);
      }
    }
  });

  // 3. Guarda las credenciales cuando cambien
  sock.ev.on('creds.update', saveCreds);

  // Evento: Participantes del grupo cambian
  sock.ev.on('group-participants.update', async (anu) => {
    try {
      const { id, participants, action } = anu;
      await Group.findOneAndUpdate({ _id: id }, { _id: id }, { upsert: true });

      for (let num of participants) {
        if (action === 'remove') {
          const user = await User.findById(num);
          if (user && user.personaje) {
            const char = user.personaje;
            const fandom = user.fandom;
            
            user.personaje = null;
            user.fandom = null;
            await user.save();

            const text = fmt.header('Notificación de Salida') + '\n' +
                         fmt.aviso(`El usuario @${num.split('@')[0]} ha dejado el grupo/comunidad.\n\nEl personaje *${char}* (${fandom}) queda *LIBRE*.`);
            
            await sock.sendMessage(id, { text, mentions: [num] });
            
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

  // Manejo de mensajes entrantes
  sock.ev.on('messages.upsert', async (chatUpdate) => {
    try {
      const m = chatUpdate.messages[0];
      if (!m.message) return;
      if (m.key.fromMe) return;

      const remoteJid = m.key.remoteJid;
      const sender = m.key.participant || remoteJid;
      const isGroup = remoteJid.endsWith('@g.us');

      if (isGroup) {
        await Group.findOneAndUpdate({ _id: remoteJid }, { _id: remoteJid }, { upsert: true });
      }
      const body = m.message.conversation || m.message.extendedTextMessage?.text || '';
      const prefix = '!';
      const isCommand = body.startsWith(prefix);

      let user = await User.findById(sender);
      if (!user) {
        user = new User({ _id: sender });
      }
      user.mensajes += 1;
      user.lastSeen = new Date();
      await user.save();

      const config = await Config.findOne({ _id: 'global' }) || await Config.create({ _id: 'global' });
      if (config.antispam.enabled) {
        const now = Date.now();
        const userSpam = spamState.get(sender) || [];
        const recentMessages = userSpam.filter(timestamp => now - timestamp < config.antispam.seconds * 1000);
        
        recentMessages.push(now);
        spamState.set(sender, recentMessages);

        if (recentMessages.length > config.antispam.limit) {
          return;
        }
      }

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

// Arrancar el Bot
startBot();

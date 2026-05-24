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

  console.log("Iniciando bot con sesión local estándar...");

  // 1. Inicializa las credenciales en la carpeta local
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    getMessage: async (key) => {
      return { conversation: 'sua-bot' };
    }
  });

  // Programar job diario (cada 24h)
  setInterval(() => dailyJob(sock), 24 * 60 * 60 * 1000);

  // 2. Escucha de eventos de conexión sin bucles infinitos
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
          // Esperar 3 segundos para evitar error 503 / Stream Error
          await new Promise(resolve => setTimeout(resolve, 3000));
          let code = await sock.requestPairingCode(phoneNumber);
          pairingCode = code?.match(/.{1,4}/g)?.join("-") || code;
          console.log(`\n====================================`);
          console.log(`TU CÓDIGO DE VINCULACIÓN: ${pairingCode}`);
          console.log(`====================================\n`);
          console.log('⚠️ Por favor, usa este código en WhatsApp en los próximos 60 segundos...');
        } catch (err) {
          console.error("❌ Error solicitando pairing code:", err);
          isPairingInProgress = false;
          pairingCode = "Error al generar código. Verifica el número de teléfono.";
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

      // Si el error es por sesión inválida (401) o error crítico de flujo (515) sin estar vinculados
      if (reason === DisconnectReason.loggedOut || reason === 401 || (reason === 515 && !state.creds.registered)) {
        console.log('Sesión inválida o corrupta. Limpiando carpeta de autenticación...');
        
        // Borramos la carpeta local para que no de errores la próxima vez
        if (fs.existsSync(authFolder)) {
          fs.rmSync(authFolder, { recursive: true, force: true });
        }
        
        console.log('Reiniciando bot para una conexión limpia...');
        setTimeout(() => startBot(), 2000);
      } else {
        // Si se cayó por internet u otra razón de red, sí intentamos reconectar de forma segura
        console.log('Desconexión temporal, reiniciando en 5 segundos...');
        setTimeout(() => startBot(), 5000);
      }
    }
  });

  // 3. Guarda las credenciales cuando cambien (esencial para Baileys)
  sock.ev.on('creds.update', saveCreds);

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

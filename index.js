const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  jidDecode
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const connectDB = require('./src/database');
const User = require('./src/models/User');
const Config = require('./src/models/Config');
const Group = require('./src/models/Group');
const handleCommand = require('./src/commands');
const moment = require('moment');
const fmt = require('./format');

// Anti-spam state
const spamState = new Map();

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
  await connectDB();
  
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: P({ level: 'silent' }),
    printQRInTerminal: true,
    auth: state,
    getMessage: async (key) => {
      return { conversation: 'sua-bot' };
    }
  });

  // Programar job diario (cada 24h)
  setInterval(() => dailyJob(sock), 24 * 60 * 60 * 1000);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) qrcode.generate(qr, { small: true });
    
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error instanceof Boom) ? 
        lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true;
      console.log('Conexión cerrada. ¿Reconectando?', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('Bot conectado correctamente');
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

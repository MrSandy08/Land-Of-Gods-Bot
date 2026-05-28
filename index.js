const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  jidDecode,
  BufferJSON,
  initAuthCreds: InitAuthCreds,
  proto
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const express = require('express');
const connectDB = require('./src/database');
const User = require('./src/models/User');
const Config = require('./src/models/Config');
const Group = require('./src/models/Group');
const Auth = require('./src/models/Auth');
const handleCommand = require('./src/commands');
const moment = require('moment');
const fmt = require('./format');
const UserGroup = require('./src/models/UserGroup');
const cron = require('node-cron');

// Anti-spam: Historial de mensajes en memoria por grupo y usuario
const msgHistory = new Map();
const floodCounters = new Map();

// Variable para guardar el código de vinculación
let pairingCode = "Esperando código...";
let isPairingInProgress = false;

// Servidor Express ultra ligero para hosting (Render, Railway, etc.)
const app = express();
const PORT = process.env.PORT || 7860;

app.get('/', (req, res) => {
  res.send(`Land of Gods Bot está en línea 🌌\n\nCódigo de vinculación: ${pairingCode}`);
});

app.listen(PORT, () => {
  console.log(`[SERVER] Puerto web activado correctamente en el puerto ${PORT}`);
});

// Función para gestionar el estado de autenticación en MongoDB
async function useMongoDBAuthState() {
  const writeData = async (data, key) => {
    try {
      // Convertimos a JSON seguro (manejando buffers y tipos específicos)
      const value = JSON.stringify(data, BufferJSON.replacer);
      await Auth.findOneAndUpdate(
        { _id: key },
        { value },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.error(`[AUTH] Error al escribir clave ${key}:`, err);
    }
  };

  const readData = async (key) => {
    try {
      const doc = await Auth.findById(key);
      if (!doc) return null;
      return JSON.parse(doc.value, BufferJSON.reviver);
    } catch (err) {
      console.error(`[AUTH] Error al leer clave ${key}:`, err);
      return null;
    }
  };

  const removeData = async (key) => {
    try {
      await Auth.findByIdAndDelete(key);
    } catch (err) {
      console.error(`[AUTH] Error al eliminar clave ${key}:`, err);
    }
  };

  // Intentamos recuperar las credenciales principales (creds)
  let creds = await readData('creds');
  if (!creds) {
    creds = InitAuthCreds();
    await writeData(creds, 'creds');
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const id of ids) {
            let value = await readData(`${type}-${id}`);
            if (value) {
              if (type === 'app-state-sync-key') {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            }
          }
          return data;
        },
        set: async (data) => {
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) {
                await writeData(value, key);
              } else {
                await removeData(key);
              }
            }
          }
        }
      }
    },
    saveCreds: async () => {
      await writeData(creds, 'creds');
    }
  };
}

// Función para evaluar antispam
const handleAntispam = (m, config, groupId) => {
  if (!config.antispam.enabled) return false;
  
  const sender = m.key.participant || m.key.remoteJid;
  const now = Date.now();
  const storageKey = `${groupId}-${sender}`;

  if (!msgHistory.has(storageKey)) {
    msgHistory.set(storageKey, []);
  }

  const userTimestamps = msgHistory.get(storageKey);
  const timeLimitMs = config.antispam.seconds * 1000;
  const recentMessages = userTimestamps.filter(timestamp => now - timestamp < timeLimitMs);

  recentMessages.push(now);
  msgHistory.set(storageKey, recentMessages);

  if (recentMessages.length > config.antispam.limit) {
    console.log(`[SPAM] Mensaje ignorado de ${sender} en ${groupId}`);
    return true;
  }

  return false;
};

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
    return;
  }

  console.log("Iniciando bot con sesión en la nube (MongoDB)...");

  // 1. Inicializa las credenciales desde MongoDB
  const { state, saveCreds } = await useMongoDBAuthState();
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
    getMessage: async (key) => {
      return { conversation: 'land-of-gods-bot' };
    }
  });

  // Programar job diario (cada 24h)
  setInterval(() => dailyJob(sock), 24 * 60 * 60 * 1000);

  // Job para limpiar usuarios que se fueron hace más de 2 semanas
  cron.schedule('0 0 * * *', async () => {
    console.log('[Limpiador] Iniciando revisión diaria de usuarios inactivos...');
    try {
      const haceDosSemanas = new Date();
      haceDosSemanas.setDate(haceDosSemanas.getDate() - 14);

      const usuariosParaBorrar = await UserGroup.find({
        fechaSalida: { $ne: null, $lt: haceDosSemanas }
      });

      if (usuariosParaBorrar.length === 0) {
        console.log('[Limpiador] No hay datos antiguos para borrar hoy.');
        return;
      }

      for (const ug of usuariosParaBorrar) {
        await UserGroup.findByIdAndDelete(ug._id);
      }

      console.log(`[Limpiador] Se han limpiado los datos de ${usuariosParaBorrar.length} usuario(s) que dejaron la comunidad hace más de 2 semanas.`);
    } catch (err) {
      console.error('[Limpiador] Error al ejecutar la limpieza automática:', err);
    }
  });

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

      if (reason === DisconnectReason.loggedOut || reason === 401 || (reason === 515 && !state.creds.registered)) {
        console.log('Sesión inválida o rechazada. Limpiando credenciales en la nube...');
        
        // Limpiamos la colección de autenticación en MongoDB
        await Auth.deleteMany({});
        
        console.log('🛑 Sesión eliminada de la base de datos. Reinicia el bot para generar un nuevo código.');
        process.exit(1);
      } else {
        console.log('Desconexión temporal de red, intentando reconectar en 7 segundos...');
        isPairingInProgress = false;
        setTimeout(() => startBot(), 7000);
      }
    }
  });

  // 3. Guarda las credenciales cuando cambien
  sock.ev.on('creds.update', saveCreds);

  // Evento: Participantes del grupo cambian
  sock.ev.on('group-participants.update', async (update) => {
    const { id: groupId, participants, action } = update;
    try {
      await Group.findOneAndUpdate({ _id: groupId }, { _id: groupId }, { upsert: true });

      if (action === 'remove') {
        for (const userId of participants) {
          try {
            const tg = await UserGroup.findOne({ userId });

            if (tg) {
              const char = tg.personaje;
              const fandom = tg.fandom;

              tg.personaje = null;
              tg.fandom = 'General';
              tg.fechaSalida = new Date();
              await tg.save();

              console.log(`[Ecosistema] @${userId.split('@')[0]} salió del grupo. Personaje liberado y temporizador de 2 semanas iniciado.`);

              if (char) {
                const text = fmt.header('Notificación de Salida') + '\n' +
                             fmt.aviso(`El usuario @${userId.split('@')[0]} ha dejado el grupo/comunidad.\n\nEl personaje *${char}* (${fandom}) queda *LIBRE*.`);

                await sock.sendMessage(groupId, { text, mentions: [userId] });

                const groups = await Group.find({ _id: { $ne: groupId } });
                for (let g of groups) {
                  await sock.sendMessage(g._id, { text, mentions: [userId] }).catch(() => null);
                }
              }
            }
          } catch (err) {
            console.error('Error al procesar salida de usuario:', err);
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

      let groupDoc = null;
      let comunidadId = null;
      if (isGroup) {
        groupDoc = await Group.findOneAndUpdate({ _id: remoteJid }, { _id: remoteJid }, { upsert: true, new: true });
        comunidadId = groupDoc?.comunidadId;
      }
      const body = m.message.conversation || m.message.extendedTextMessage?.text || '';
      const prefix = '!';
      const isCommand = body.startsWith(prefix);

      // 1. Rastreo de Actividad y Base de Datos
      let user = await User.findById(sender);
      if (!user) {
        user = new User({ _id: sender });
      }
      let userGroup;
      
      if (isGroup) {
        userGroup = await UserGroup.getOrCreate(sender, remoteJid, comunidadId);
        userGroup.mensajes += 1;
        userGroup.lastSeen = new Date();
        if (userGroup.fechaSalida) {
          userGroup.fechaSalida = null;
        }
        await userGroup.save();
      }
      
      // 2. Control Anti-spam y Flood
      const config = await Config.findOne({ _id: 'global' }) || await Config.create({ _id: 'global' });
      
      // Control de Flood (cierre automático de grupo) - En memoria local
      if (isGroup) {
        const yaEstaCerrando = floodCounters.get(`lock:mute:${remoteJid}`);
        
        if (!yaEstaCerrando) {
          const llaveFloodGlobal = `flood:${remoteJid}`;
          let totalMensajesGrupo = floodCounters.get(llaveFloodGlobal) || 0;
          totalMensajesGrupo += 1;
          floodCounters.set(llaveFloodGlobal, totalMensajesGrupo);
          
          if (totalMensajesGrupo === 1) {
            setTimeout(() => {
              floodCounters.delete(llaveFloodGlobal);
            }, (config.antispam?.seconds || 4) * 1000);
          }

          const limiteConfigurado = config.antispam?.limit || 6;
          if (totalMensajesGrupo > limiteConfigurado && config.antispam?.enabled) {
            floodCounters.set(`lock:mute:${remoteJid}`, 'true');
            
            try {
              await sock.groupSettingUpdate(remoteJid, 'announcement');
              
              const u = await UserGroup.getOrCreate(sender);
              const razon = `Hacer flood/spam en el chat.`;
              
              u.advertencias.push({
                razon,
                admin: 'SYSTEM_ANTI_FLOOD'
              });
              await u.save();

              const jidClean = sender.split('@')[0];
              let textoAviso = `🚨 *CONTROL DE FLOOD* 🚨\n\n` +
                               `Se ha detectado un flujo excesivo de mensajes. El grupo permanecerá cerrado durante *30 segundos*.\n\n` +
                               `⚠️ *Sanción Automática (Sin Expulsión):*\n` +
                               `• *Usuario:* @${jidClean}\n` +
                               `• *Motivo:* Flood masivo en el chat.\n` +
                               `• *Advertencias totales:* ${u.advertencias.length}/${config.maxAdvertencias}`;

              await sock.sendMessage(m.key.remoteJid, { text: textoAviso, mentions: [sender] }, { quoted: m });

              setTimeout(async () => {
                try {
                  await sock.groupSettingUpdate(remoteJid, 'not_announcement');
                  
                  await sock.sendMessage(remoteJid, {
                    text: `✅ *CHAT REABIERTO*\n\nEl grupo ha sido abierto nuevamente. Por favor, mantengan el orden o el sistema volverá a actuar.`
                  });
                  
                  floodCounters.delete(llaveFloodGlobal);
                } catch (err) {
                  console.error('Error al reabrir el grupo automáticamente:', err);
                }
                floodCounters.delete(`lock:mute:${remoteJid}`);
              }, 30000);

            } catch (err) {
              console.error('Error en el proceso de muteo por flood:', err);
              floodCounters.delete(`lock:mute:${remoteJid}`);
            }
          }
        }
      }

      const isSpamming = handleAntispam(m, config, remoteJid);
      if (isSpamming) {
        return;
      }

      // --- LISTENERS ESPECIALES (Economía y Tiendas) ---
      const Tienda = require('./src/models/Tienda');
      
      // 1. Usuario en modo "diseño de tienda" (Corregido con validación de existencia)
      if (handleCommand && handleCommand.modoDiseñoTienda && handleCommand.modoDiseñoTienda.has(sender)) {
        try {
          let tienda = await Tienda.findOne({ ownerId: sender });
          if (!tienda) tienda = new Tienda({ ownerId: sender });
          
          tienda.diseñoLibre = body;
          await tienda.save();
          
          handleCommand.modoDiseñoTienda.delete(sender);
          await sock.sendMessage(remoteJid, { text: '✅ Diseño de tienda guardado!', mentions: [sender] }, { quoted: m });
          return;
        } catch (err) {
          console.error('Error guardando diseño de tienda:', err);
        }
      }

      // 2. Comandos !aceptar o !rechazar en respuesta a transacción pendiente (Corregido con validación de existencia)
      if (isCommand) {
        const args = body.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        
        if (command === 'aceptar' || command === 'rechazar') {
          const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          const quotedParticipant = m.message?.extendedTextMessage?.contextInfo?.participant;
          
          if (quotedParticipant && quotedParticipant.endsWith('@s.whatsapp.net')) {
            const quotedMessageId = m.message?.extendedTextMessage?.contextInfo?.stanzaId;
            
            // CORRECCIÓN AQUÍ: Validamos que transaccionesPendientes exista antes de usar .has()
            if (handleCommand && handleCommand.transaccionesPendientes && handleCommand.transaccionesPendientes.has(quotedMessageId)) {
              const transaccion = handleCommand.transaccionesPendientes.get(quotedMessageId);
              
              if (sender === transaccion.vendedorId) {
                if (command === 'aceptar') {
                  let comprador = await User.findById(transaccion.compradorId);
                  if (!comprador) comprador = new User({ _id: transaccion.compradorId });
                  
                  let vendedor = await User.findById(transaccion.vendedorId);
                  if (!vendedor) vendedor = new User({ _id: transaccion.vendedorId });
                  
                  if (comprador.saldo >= transaccion.monto) {
                    comprador.saldo -= transaccion.monto;
                    vendedor.saldo += transaccion.monto;
                    await comprador.save();
                    await vendedor.save();
                    
                    await sock.sendMessage(remoteJid, {
                      text: `✅ Venta confirmada! @${transaccion.compradorId.split('@')[0]} compró '${transaccion.producto}' de @${transaccion.vendedorId.split('@')[0]} por ${transaccion.monto} monedas.`,
                      mentions: [transaccion.compradorId, transaccion.vendedorId]
                    }, { quoted: m });
                  } else {
                    await sock.sendMessage(remoteJid, {
                      text: '❌ El comprador no tiene suficiente saldo.',
                      mentions: [transaccion.compradorId]
                    }, { quoted: m });
                  }
                } else {
                  await sock.sendMessage(remoteJid, {
                    text: `❌ Venta de '${transaccion.producto}' cancelada.`,
                    mentions: [transaccion.compradorId, transaccion.vendedorId]
                  }, { quoted: m });
                }
                
                handleCommand.transaccionesPendientes.delete(quotedMessageId);
                return;
              }
            }
          }
        }
      }

      // 3. Manejo normal de comandos
      if (isCommand) {
        const args = body.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        
        console.log(`[COMANDO] Recibido: ${prefix}${command} de ${sender} en grupo ${remoteJid}`);
        
        try {
          // EN ORDEN: sock, m, command, args, user, config, remoteJid (groupId), sender
          await handleCommand(sock, m, command, args, user, config, remoteJid, sender);
        } catch (cmdErr) {
          console.error(`❌ Error crítico ejecutando el comando !${command}:`, cmdErr);
        }
      } else {
        await user.save();
      }

    } catch (err) {
      console.error('❌ Error en messages.upsert:', err);
    }
  });
}

// Escudo protector contra crashes inesperados (Evita el desplome por SIGTERM en Render)
process.on('uncaughtException', (err) => {
  console.error('⚠️ Se detectó una excepción no controlada en el Bot:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Se detectó una promesa rechazada no manejada:', reason);
});

// Arrancar el Bot
startBot();

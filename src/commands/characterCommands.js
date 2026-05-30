const User = require('../models/User');
const UserGroup = require('../models/UserGroup');
const Group = require('../models/Group');
const Pedido = require('../models/Pedido');
const moment = require('moment');
const fmt = require('../../format');
const { isAdmin, getUserId } = require('../utils');

const normalizarTexto = (texto) => {
    return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/4/g, "a")
        .replace(/3/g, "e")
        .replace(/1/g, "i")
        .replace(/0/g, "o")
        .replace(/[^a-z0-9]/g, "");
};

module.exports = {
    asignar: async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
        try {
            const remoteJid = m.key.remoteJid;
            if (!remoteJid.endsWith('@g.us')) return;

            if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo admins pueden usar este comando.'));
            if (args.length < 1) return reply(fmt.aviso('Uso: !asignar @user Personaje (Fandom) O !asignar Personaje (Fandom)'));
            
            let targetId = sender;
            let personajeArgsStart = 0;
            
            const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            const quotedParticipant = m.message?.extendedTextMessage?.contextInfo?.participant;
            
            if (mentionedJid) {
                targetId = mentionedJid;
                personajeArgsStart = 1;
            } else if (quotedParticipant && quotedParticipant !== sender) {
                targetId = quotedParticipant;
                personajeArgsStart = 0;
            } else if (args[0] && (args[0].includes('@s.whatsapp.net') || args[0].startsWith('@'))) {
                const possibleUser = await getUserId(args[0], m, sender);
                if (possibleUser && possibleUser !== sender) {
                    targetId = possibleUser;
                    personajeArgsStart = 1;
                }
            }

            let fullText = args.slice(personajeArgsStart).join(' ');
            if (!fullText) return reply(fmt.aviso('Debes especificar el personaje.'));

            let personaje = fullText;
            let fandom = 'General';
            
            const fandomMatch = fullText.match(/\(([^)]+)\)/);
            if (fandomMatch) {
                fandom = fandomMatch[1];
                personaje = fullText.replace(fandomMatch[0], '').trim();
            }

            const Group = require('../models/Group');
            const groupDoc = await Group.findById(groupId);
            const comunidadId = groupDoc?.comunidadId;

            let filter = {};
            if (comunidadId) {
                filter.comunidadId = comunidadId;
            } else {
                filter.groupId = groupId;
            }

            const personajeLimpio = normalizarTexto(personaje);
            const regexBusqueda = new RegExp(personajeLimpio.split('').join('[^a-zA-Z0-9]*'), 'i');

            const personajeExiste = await UserGroup.findOne({
                ...filter,
                userId: { $ne: targetId },
                fandom: { $regex: new RegExp(`^${fandom}$`, 'i') },
                personaje: { $regex: regexBusqueda }
            });

            if (personajeExiste) {
                personajeExiste.personaje = null;
                personajeExiste.fandom = 'General';
                await personajeExiste.save();
            }

            const tg = await UserGroup.getOrCreate(targetId, groupId);
            tg.personaje = personaje;
            tg.fandom = fandom;
            await tg.save();

            const jidClean = targetId.split('@')[0];
            await sock.sendMessage(m.key.remoteJid, {
                text: fmt.aviso(`🎭 Personaje *${personaje}* (${fandom}) asignado con éxito a @${jidClean} `),
                mentions: [targetId]
            }, { quoted: m });
        } catch (err) {
            console.error('Error en !asignar:', err);
            reply(fmt.aviso('Ocurrió un error al asignar el personaje.'));
        }
    },

    // === COMANDO PERFIL (ESTÉTICA NUEVA) ===
    perfil: async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
        try {
            const jidClean = sender.split('@')[0];
            const personaje = userGroup?.personaje || 'Sin personaje';
            const fandom = userGroup?.fandom || 'Ninguno';
            
            // Construimos usando la interfaz estética nativa de format.js
            let text = fmt.infoHeader();
            text += `\n                     𝄄 𓈒   ⁺ PERFIL DE USUARIO   𓏼\n`;
            text += fmt.infoField('Usuario', `@${jidClean}`);
            text += fmt.infoField('Personaje', `*${personaje}*`);
            text += fmt.infoField('Fandom', `*(${fandom})*`);
            
            if (currentUser && typeof currentUser.saldo !== 'undefined') {
                text += fmt.infoField('Saldo actual', `*${currentUser.saldo}* monedas`);
            }
            
            text += `\n\n       @ Atte : 𝓛and 𝓞f 𝓖ods`;

            await sock.sendMessage(m.key.remoteJid, { text, mentions: [sender] }, { quoted: m });
        } catch (err) {
            console.error('Error en !perfil:', err);
            return reply(fmt.aviso('Error al intentar cargar la interfaz de tu perfil.'));
        }
    },

    // === INTERRUPTOR: SOLO ADMINS (ESTÉTICA NUEVA) ===
    botmodoadmin: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        try {
            const { isAdmin } = require('../utils');
            if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo los administradores del grupo pueden usar este comando.'));
            
            const Group = require('../models/Group');
            const groupConfig = await Group.findById(groupId);
            
            if (!groupConfig) return reply(fmt.aviso('No se pudo encontrar la configuración de este grupo.'));

            groupConfig.soloAdmins = !groupConfig.soloAdmins;
            await groupConfig.save();

            const estado = groupConfig.soloAdmins
                ? 'ACTIVADO 🔒\n       𝄄   _Solo los administradores pueden usar el bot_'
                : 'DESACTIVADO 🔓\n       𝄄   _Todos los miembros pueden usar el bot_';
                
            return reply(fmt.aviso(`Configuración modificada:\n       𝄄\n       𝄄➥ El modo administración está ${estado}`));
        } catch (err) {
            console.error('Error en !botmodoadmin:', err);
            return reply(fmt.aviso('Ocurrió un error inesperado al intentar cambiar la configuración del grupo.'));
        }
    },

    personajes: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        try {
            const groupDoc = await Group.findById(groupId);
            const comunidadId = groupDoc?.comunidadId;

            // Conseguimos los integrantes reales que están físicamente en el grupo de WhatsApp
            const metadata = await sock.groupMetadata(groupId).catch(() => null);
            if (!metadata) return reply(fmt.aviso('No se pudo obtener la lista de miembros del grupo.'));
            const integrantesActivos = metadata.participants.map(p => p.id);

            let filter = { personaje: { $exists: true, $ne: "Sin personaje", $ne: "" } };
            if (comunidadId) {
                filter.comunidadId = comunidadId;
            } else {
                filter.groupId = groupId;
            }

            // Buscamos los personajes de la base de datos
            const users = await UserGroup.find(filter).select('userId personaje fandom').lean();
            
            // 🔥 FILTRO ANTIFANTASMAS: Solo se quedan los que sigan estando en el grupo de WhatsApp
            const usersFiltrados = users.filter(u => integrantesActivos.includes(u.userId));

            if (usersFiltrados.length === 0) return reply(fmt.aviso('No hay personajes asignados en este grupo/comunidad.'));

            // Agrupación por Fandom
            const mapaFandoms = {};
            usersFiltrados.forEach(u => {
                const fandomNombre = u.fandom ? u.fandom.trim() : 'Otros';
                if (!mapaFandoms[fandomNombre]) {
                    mapaFandoms[fandomNombre] = [];
                }
                mapaFandoms[fandomNombre].push(u);
            });

            let text = fmt.header();
            text += fmt.listSection('LISTA DE PERSONAJES OCUPADOS');
            const mentions = [];

            for (const [fandom, listaUsuarios] of Object.entries(mapaFandoms)) {
                text += `\n            𝄄 𓈒   ⁺ 🎭 ${fandom.toUpperCase()}   𓏼\n`;
                listaUsuarios.forEach(u => {
                    const jidClean = u.userId.split('@')[0];
                    text += fmt.listItem(`@${jidClean} - *${u.personaje}*`);
                    mentions.push(u.userId);
                });
            }

            text += `\n\n       @ Lifeline : 𝓛and 𝓞f 𝓖ods`;

            await sock.sendMessage(m.key.remoteJid, { text, mentions }, { quoted: m });
        } catch (err) {
            console.error('Error en !personajes:', err);
            reply(fmt.aviso('Error al cargar la lista de personajes.'));
        }
    },

    pedir: async (sock, m, args, currentUser, config, reply, sender) => {
        try {
            if (args.length < 1) return reply(fmt.aviso('Uso: !pedir Personaje (Fandom)'));
            let fullText = args.join(' ');
            let personaje = fullText;
            let fandom = 'General';
            
            const fandomMatch = fullText.match(/\(([^)]+)\)/);
            if (fandomMatch) {
                fandom = fandomMatch[1];
                personaje = fullText.replace(fandomMatch[0], '').trim();
            }

            await Pedido.create({ user: sender, personaje, fandom });
            reply(fmt.aviso(`Tu pedido para *${personaje}* (${fandom}) ha sido registrado.`));
        } catch (err) {
            console.error('Error en !pedir:', err);
            reply(fmt.aviso('No se pudo registrar tu pedido.'));
        }
    },

    pedidos: async (sock, m, args, currentUser, config, reply) => {
        try {
            const pedidos = await Pedido.find().sort({ fandom: 1 }).select('_id user personaje fandom').lean();
            if (pedidos.length === 0) return reply(fmt.aviso('No hay pedidos pendientes.'));

            let text = fmt.header();
            text += fmt.listSection('PEDIDOS PENDIENTES');
            const mentions = [];

            const grouped = {};
            pedidos.forEach(p => {
                if (!grouped[p.fandom]) grouped[p.fandom] = [];
                grouped[p.fandom].push(p);
            });

            let globalIndex = 1;
            for (const fandom in grouped) {
                text += `\n*—— ${fandom.toUpperCase()} ——*\n`;
                grouped[fandom].forEach(p => {
                    const jidClean = p.user.split('@')[0];
                    text += fmt.listItem(`[#${globalIndex}] @${jidClean}  -> *${p.personaje}*`);
                    mentions.push(p.user);
                    globalIndex++;
                });
            }

            await sock.sendMessage(m.key.remoteJid, { text, mentions }, { quoted: m });
        } catch (err) {
            console.error('Error en !pedidos:', err);
            reply(fmt.aviso('Error al cargar la lista de pedidos.'));
        }
    },

    sinpersonaje: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        try {
            const groupDoc = await Group.findById(groupId);
            const comunidadId = groupDoc?.comunidadId;

            let filter = {
                $or: [
                    { personaje: null },
                    { personaje: { $exists: false } },
                    { personaje: "" },
                    { personaje: "Sin personaje" }
                ]
            };

            if (comunidadId) {
                filter.comunidadId = comunidadId;
            } else {
                filter.groupId = groupId;
            }

            const users = await UserGroup.find(filter)
                .select('userId')
                .lean();

            if (users.length === 0) return reply(fmt.aviso('Todos los usuarios tienen personaje asignado.'));

            let text = fmt.header();
            text += fmt.listSection('USUARIOS SIN PERSONAJE');
            const mentions = [];

            users.forEach((u) => {
                const jidClean = u.userId.split('@')[0];
                text += fmt.listItem(`@${jidClean}`);
                mentions.push(u.userId);
            });

            await sock.sendMessage(m.key.remoteJid, { text, mentions }, { quoted: m });
        } catch (err) {
            console.error('Error en !sinpersonaje:', err);
            reply(fmt.aviso('Error al cargar la lista de usuarios sin personaje.'));
        }
    }
};
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

            const tg = await UserGroup.getOrCreate(targetId, groupId, comunidadId);
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

    personajes: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        try {
            const groupDoc = await Group.findById(groupId);
            const comunidadId = groupDoc?.comunidadId;

            let filter = { personaje: { $ne: null } };
            if (comunidadId) {
                filter.comunidadId = comunidadId;
            } else {
                filter.groupId = groupId;
            }

            const users = await UserGroup.find(filter)
                .sort({ fandom: 1 })
                .select('userId personaje fandom')
                .lean();

            if (users.length === 0) return reply(fmt.aviso('No hay personajes asignados.'));

            let text = fmt.header();
            text += fmt.listSection('LISTA DE PERSONAJES');
            const mentions = [];

            users.forEach((u) => {
                const jidClean = u.userId.split('@')[0];
                text += fmt.listItem(`@${jidClean}  𝄄 *${u.personaje}* _(${u.fandom})_`);
                mentions.push(u.userId);
            });

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

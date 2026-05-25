const User = require('../models/User');
const UserGroup = require('../models/UserGroup');
const Pedido = require('../models/Pedido');
const moment = require('moment');
const fmt = require('../../format');
const { isAdmin, getUserId } = require('../utils');

module.exports = {
    asignar: async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
        if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo admins pueden usar este comando.'));
        if (args.length < 1) return reply(fmt.aviso('Uso: !asignar @user Personaje (Fandom) O !asignar Personaje (Fandom) (para ti mismo)'));
        
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

        if (personajeArgsStart >= args.length) {
            return reply(fmt.aviso('Debes especificar un personaje. Uso: !asignar @user Personaje (Fandom)'));
        }

        let fullText = args.slice(personajeArgsStart).join(' ');
        let personaje = fullText;
        let fandom = 'General';
        
        const fandomMatch = fullText.match(/\(([^)]+)\)/);
        if (fandomMatch) {
            fandom = fandomMatch[1];
            personaje = fullText.replace(fandomMatch[0], '').trim();
        }

        const existing = await UserGroup.findOne({ groupId, personaje: new RegExp(`^${personaje}$`, 'i'), fandom: new RegExp(`^${fandom}$`, 'i') });
        if (existing) {
            const existingUser = await User.findById(existing.userId);
            return reply(fmt.aviso(`El personaje *${personaje}* (${fandom}) ya está ocupado por ${fmt.mention(existing.userId)}.`));
        }

        const targetUserGroup = await UserGroup.getOrCreate(targetId, groupId);
        targetUserGroup.personaje = personaje;
        targetUserGroup.fandom = fandom;
        await targetUserGroup.save();

        reply(fmt.aviso(`Personaje *${personaje}* (${fandom}) asignado a ${fmt.mention(targetId)}.`));
    },

    personajes: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        const users = await UserGroup.find({ groupId, personaje: { $ne: null } }).sort({ fandom: 1 });
        if (users.length === 0) return reply(fmt.aviso('No hay personajes asignados en este grupo.'));

        let text = fmt.header();
        const grouped = {};
        users.forEach(u => {
            if (!grouped[u.fandom]) grouped[u.fandom] = [];
            grouped[u.fandom].push(u);
        });

        for (const fandom in grouped) {
            text += fmt.listSection(fandom.toUpperCase());
            grouped[fandom].forEach((u, i) => {
                text += fmt.listItem(`${u.personaje} - @${u.userId.split('@')[0]}`);
            });
            text += '\n';
        }
        const mentions = users.map(u => u.userId);
        await sock.sendMessage(m.key.remoteJid, { text, mentions }, { quoted: m });
    },

    perfil: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        const targetId = (args.length > 0) ? await getUserId(args[0], m, sender) : sender;
        const u = await UserGroup.getOrCreate(targetId, groupId);
        const user = await User.findById(targetId);

        const diff = moment().diff(moment(u.lastSeen), 'days');
        let status = 'Activo';
        if (u.excusa?.activa) status = 'Con Excusa';
        else if (diff >= config.minInactividad) status = 'Inactivo';

        let text = fmt.header('Perfil de Usuario') + '\n';
        text += fmt.infoHeader();
        text += fmt.infoField('Personaje', u.personaje || 'Ninguno');
        text += fmt.infoField('Fandom', u.fandom || 'Ninguno');
        text += fmt.infoField('Mensajes', u.mensajes);
        text += fmt.infoField('Estado', status);
        text += fmt.infoField('Advertencias', `${u.advertencias.length}/${config.maxAdvertencias}`);
        text += fmt.infoField('Última vez', moment(u.lastSeen).fromNow());
        
        text += '\n\n' + fmt.aviso('Información actualizada.');
        await sock.sendMessage(m.key.remoteJid, { text, mentions: [targetId] }, { quoted: m });
    },

    sinpersonaje: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        const users = await UserGroup.find({ groupId, personaje: null });
        if (users.length === 0) return reply(fmt.aviso('Todos tienen personaje en este grupo.'));
        
        let text = fmt.header();
        text += fmt.listSection('USUARIOS');
        const mentions = [];
        users.forEach((u) => {
            text += fmt.listItem(fmt.mention(u.userId));
            mentions.push(u.userId);
        });
        await sock.sendMessage(m.key.remoteJid, { text, mentions }, { quoted: m });
    },

    pedir: async (sock, m, args, currentUser, config, reply, sender) => {
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
    },

    pedidos: async (sock, m, args, currentUser, config, reply) => {
        const pedidos = await Pedido.find().sort({ fandom: 1 });
        if (pedidos.length === 0) return reply(fmt.aviso('No hay pedidos pendientes.'));

        let text = fmt.header();
        const grouped = {};
        pedidos.forEach(p => {
            if (!grouped[p.fandom]) grouped[p.fandom] = [];
            grouped[p.fandom].push(p);
        });

        for (const fandom in grouped) {
            text += fmt.listSection(fandom);
            grouped[fandom].forEach((p, i) => {
                text += fmt.listItem(p.personaje);
            });
            text += '\n';
        }
        reply(text);
    }
};

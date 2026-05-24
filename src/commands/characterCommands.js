const User = require('../models/User');
const Pedido = require('../models/Pedido');
const moment = require('moment');
const fmt = require('../../format');
const { isAdmin, getUserId } = require('../utils');

module.exports = {
    asignar: async (sock, m, args, currentUser, config, reply, sender) => {
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

        const existing = await User.findOne({ personaje: new RegExp(`^${personaje}$`, 'i'), fandom: new RegExp(`^${fandom}$`, 'i') });
        if (existing) return reply(fmt.aviso(`El personaje *${personaje}* (${fandom}) ya está ocupado por ${fmt.mention(existing._id)}.`));

        let targetUser = await User.findById(targetId);
        if (!targetUser) targetUser = new User({ _id: targetId });
        
        targetUser.personaje = personaje;
        targetUser.fandom = fandom;
        await targetUser.save();

        reply(fmt.aviso(`Personaje *${personaje}* (${fandom}) asignado a ${fmt.mention(targetId)}.`));
    },

    personajes: async (sock, m, args, currentUser, config, reply) => {
        const users = await User.find({ personaje: { $ne: null } }).sort({ fandom: 1 });
        if (users.length === 0) return reply(fmt.aviso('No hay personajes asignados.'));

        let text = fmt.header();
        const grouped = {};
        users.forEach(u => {
            if (!grouped[u.fandom]) grouped[u.fandom] = [];
            grouped[u.fandom].push(u);
        });

        for (const fandom in grouped) {
            text += fmt.listSection(fandom.toUpperCase());
            grouped[fandom].forEach((u, i) => {
                text += fmt.listItem(`${u.personaje} - @${u._id.split('@')[0]}`);
            });
            text += '\n';
        }
        reply(text);
    },

    perfil: async (sock, m, args, currentUser, config, reply, sender) => {
        const targetId = (args.length > 0) ? await getUserId(args[0], m, sender) : sender;
        const u = await User.findById(targetId);
        if (!u) return reply(fmt.aviso('Usuario no encontrado.'));

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
        reply(text);
    },

    sinpersonaje: async (sock, m, args, currentUser, config, reply) => {
        const users = await User.find({ personaje: null });
        if (users.length === 0) return reply(fmt.aviso('Todos tienen personaje.'));
        
        let text = fmt.header();
        text += fmt.listSection('USUARIOS');
        const mentions = [];
        users.forEach((u) => {
            text += fmt.listItem(fmt.mention(u._id));
            mentions.push(u._id);
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

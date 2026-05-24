const User = require('../models/User');
const moment = require('moment');
const fmt = require('../../format');

module.exports = {
    top: async (sock, m, args, currentUser, config, reply) => {
        const limit = parseInt(args[0]) || 10;
        const top = await User.find().sort({ mensajes: -1 }).limit(limit);
        let text = fmt.header() + '\n';
        text += fmt.listSection('RANKING');
        const mentions = [];
        top.forEach((u) => {
            text += fmt.listItem(`${fmt.mention(u._id)} - ${u.mensajes} mjs`);
            mentions.push(u._id);
        });
        await sock.sendMessage(m.key.remoteJid, { text, mentions }, { quoted: m });
    },

    low: async (sock, m, args, currentUser, config, reply) => {
        const low = await User.find().sort({ mensajes: 1 }).limit(10);
        let text = fmt.header('Low 10') + '\n';
        text += fmt.listSection('RANKING');
        const mentions = [];
        low.forEach((u) => {
            text += fmt.listItem(`${fmt.mention(u._id)} - ${u.mensajes} mjs`);
            mentions.push(u._id);
        });
        await sock.sendMessage(m.key.remoteJid, { text, mentions }, { quoted: m });
    },

    inactivos: async (sock, m, args, currentUser, config, reply) => {
        const days = parseInt(args[0]) || config.minInactividad;
        const threshold = moment().subtract(days, 'days').toDate();
        const inactivos = await User.find({ 
            lastSeen: { $lt: threshold },
            personaje: { $ne: null }
        });

        if (inactivos.length === 0) return reply(fmt.aviso(`No hay inactivos de ${days} días.`));

        let text = fmt.header() + '\n';
        text += fmt.listSection('USUARIOS');
        const mentions = [];
        inactivos.forEach((u) => {
            const d = moment().diff(moment(u.lastSeen), 'days');
            text += fmt.listItem(`${fmt.mention(u._id)} - ${u.personaje}`) + `       𝄄   _hace ${d} dias sin hablar_\n\n`;
            mentions.push(u._id);
        });
        await sock.sendMessage(m.key.remoteJid, { text, mentions }, { quoted: m });
    }
};

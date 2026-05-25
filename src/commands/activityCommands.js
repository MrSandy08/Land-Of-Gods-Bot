const User = require('../models/User');
const UserGroup = require('../models/UserGroup');
const moment = require('moment');
const fmt = require('../../format');

module.exports = {
    top: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        const limit = parseInt(args[0]) || 10;
        const top = await UserGroup.find({ groupId }).sort({ mensajes: -1 }).limit(limit);
        let text = fmt.header();
        text += fmt.listSection('RANKING');
        const mentions = [];
        top.forEach((ug) => {
            text += fmt.listItem(`${fmt.mention(ug.userId)} - ${ug.mensajes} mjs`);
            mentions.push(ug.userId);
        });
        await sock.sendMessage(m.key.remoteJid, { text, mentions }, { quoted: m });
    },

    low: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        const low = await UserGroup.find({ groupId }).sort({ mensajes: 1 }).limit(10);
        let text = fmt.header('Low 10') + '\n';
        text += fmt.listSection('RANKING');
        const mentions = [];
        low.forEach((ug) => {
            text += fmt.listItem(`${fmt.mention(ug.userId)} - ${ug.mensajes} mjs`);
            mentions.push(ug.userId);
        });
        await sock.sendMessage(m.key.remoteJid, { text, mentions }, { quoted: m });
    },

    inactivos: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        const days = parseInt(args[0]) || config.minInactividad;
        const threshold = moment().subtract(days, 'days').toDate();
        const inactivos = await UserGroup.find({ 
            groupId,
            lastSeen: { $lt: threshold },
            personaje: { $ne: null }
        });

        if (inactivos.length === 0) return reply(fmt.aviso(`No hay inactivos de ${days} días en este grupo.`));

        let text = fmt.header();
        text += fmt.listSection('USUARIOS');
        const mentions = [];
        inactivos.forEach((ug) => {
            const d = moment().diff(moment(ug.lastSeen), 'days');
            text += fmt.listItem(`${fmt.mention(ug.userId)} - ${ug.personaje}`) + `       𝄄   _hace ${d} dias sin hablar_\n\n`;
            mentions.push(ug.userId);
        });
        await sock.sendMessage(m.key.remoteJid, { text, mentions }, { quoted: m });
    }
};

const User = require('../models/User');
const UserGroup = require('../models/UserGroup');
const Group = require('../models/Group');
const moment = require('moment');
const fmt = require('../../format');

module.exports = {
    top: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        try {
            const limit = parseInt(args[0]) || 10;
            if (isNaN(limit) || limit <= 0) return reply(fmt.aviso('Por favor ingresa un número válido.'));

            const groupDoc = await Group.findById(groupId);
            const comunidadId = groupDoc?.comunidadId;

            let filter;
            if (comunidadId) {
                filter = { comunidadId };
            } else {
                filter = { groupId };
            }

            const top = await UserGroup.find(filter)
                .sort({ mensajes: -1 })
                .limit(limit)
                .select('userId mensajes personaje')
                .lean();

            if (top.length === 0) return reply(fmt.aviso('No hay datos de actividad.'));

            let text = fmt.header();
            text += fmt.listSection('RANKING TOP ACTIVIDAD');
            const mentions = [];

            top.forEach((ug, index) => {
                const jidClean = ug.userId.split('@')[0];
                const tagPersonaje = ug.personaje ? ` (${ug.personaje})` : ' (Sin Personaje)';
                text += fmt.listItem(`*[${index + 1}]* @${jidClean} ${tagPersonaje} 𝄄 _${ug.mensajes} mjs_`);
                mentions.push(ug.userId);
            });

            await sock.sendMessage(m.key.remoteJid, { text, mentions }, { quoted: m });
        } catch (err) {
            console.error('Error en !top:', err);
            reply(fmt.aviso('Ocurrió un error al obtener el top de actividad.'));
        }
    },

    low: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        try {
            const groupDoc = await Group.findById(groupId);
            const comunidadId = groupDoc?.comunidadId;

            let filter;
            if (comunidadId) {
                filter = { comunidadId };
            } else {
                filter = { groupId };
            }

            const low = await UserGroup.find(filter)
                .sort({ mensajes: 1 })
                .limit(10)
                .select('userId mensajes personaje')
                .lean();

            if (low.length === 0) return reply(fmt.aviso('No hay usuarios registrados.'));

            let text = fmt.header();
            text += fmt.listSection('RANKING MENOS ACTIVOS');
            const mentions = [];

            low.forEach((ug, index) => {
                const jidClean = ug.userId.split('@')[0];
                const tagPersonaje = ug.personaje ? ` (${ug.personaje})` : ' (Sin Personaje)';
                text += fmt.listItem(`*[${index + 1}]* @${jidClean}${tagPersonaje} 𝄄 _${ug.mensajes} mjs_`);
                mentions.push(ug.userId);
            });

            await sock.sendMessage(m.key.remoteJid, { text, mentions }, { quoted: m });
        } catch (err) {
            console.error('Error en !low:', err);
            reply(fmt.aviso('Ocurrió un error al obtener el ranking bajo.'));
        }
    },

    inactivos: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        try {
            const days = parseInt(args[0]) || config.minInactividad;
            if (isNaN(days) || days <= 0) return reply(fmt.aviso('Número de días inválido.'));

            const threshold = moment().subtract(days, 'days').toDate();
            const fechaInmunidad = moment().subtract(7, 'days').toDate();

            const groupDoc = await Group.findById(groupId);
            const comunidadId = groupDoc?.comunidadId;

            let filter = {
                lastSeen: { $lt: threshold }
            };
            if (comunidadId) {
                filter.comunidadId = comunidadId;
            } else {
                filter.groupId = groupId;
            }

            const candidatos = await UserGroup.find(filter)
            .select('userId personaje lastSeen createdAt')
            .lean();

            const inactivos = candidatos.filter(ug => {
                const fechaRegistro = ug.createdAt || ug.lastSeen;
                return fechaRegistro < fechaInmunidad;
            });

            if (inactivos.length === 0) {
                return reply(fmt.aviso(`No hay usuarios inactivos de ${days} días (excluyendo nuevos con inmunidad).`));
            }

            let text = fmt.header();
            text += fmt.listSection(`INACTIVOS (${days}+ DÍAS)`);
            const mentions = [];

            inactivos.forEach((ug) => {
                const d = moment().diff(moment(ug.lastSeen), 'days');
                const jidClean = ug.userId.split('@')[0];
                const tagPersonaje = ug.personaje ? ` - ${ug.personaje}` : ' - (Sin Personaje)';
                
                text += fmt.listItem(`@${jidClean} ${tagPersonaje}\n`) + `       𝄄   _Hace ${d} días sin aparecer_\n\n`;
                mentions.push(ug.userId);
            });

            await sock.sendMessage(m.key.remoteJid, { text, mentions }, { quoted: m });
        } catch (err) {
            console.error('Error en !inactivos:', err);
            reply(fmt.aviso('Ocurrió un error al buscar usuarios inactivos.'));
        }
    }
};

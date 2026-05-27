const User = require('../models/User');
const UserGroup = require('../models/UserGroup');
const moment = require('moment');
const fmt = require('../../format');
const { isAdmin, getUserId } = require('../utils');

module.exports = {
    excusa: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        try {
            if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo admins.'));
            if (args.length < 2) return reply(fmt.aviso('Uso: !excusa @user/personaje [razon] [dias]'));
            
            const targetId = await getUserId(args[0], m);
            if (!targetId) return reply(fmt.aviso('No se encontró al usuario.'));

            let dias = 7;
            let razonArgs = args.slice(1);
            if (!isNaN(razonArgs[razonArgs.length - 1])) {
                dias = parseInt(razonArgs.pop());
            }
            const razon = razonArgs.join(' ');

            const u = await UserGroup.getOrCreate(targetId, groupId);
            u.excusa = {
                fin: moment().add(dias, 'days').toDate(),
                razon,
                activa: true
            };
            await u.save();

            const jidClean = targetId.split('@')[0];
            await sock.sendMessage(m.key.remoteJid, {
                text: fmt.aviso(`Excusa puesta a @${jidClean} por ${dias} días.\nMotivo: ${razon}`),
                mentions: [targetId]
            }, { quoted: m });
        } catch (err) {
            console.error('Error en !excusa:', err);
            reply(fmt.aviso('Error al procesar la excusa.'));
        }
    },

    excusas: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        try {
            const users = await UserGroup.find({ groupId, 'excusa.activa': true }).lean();
            if (users.length === 0) return reply(fmt.aviso('No hay excusas activas en este grupo.'));

            let text = fmt.header();
            text += fmt.listSection('EXCUSAS ACTUALES');
            const mentions = [];

            users.forEach((ug, i) => {
                const diasRestantes = moment(ug.excusa.fin).diff(moment(), 'days');
                const jidClean = ug.userId.split('@')[0];
                
                text += fmt.listItem(`[#${i + 1}] @${jidClean} - ${ug.personaje}\n`) +
                        `       𝄄   _Motivo: ${ug.excusa.razon}_\n` +
                        `       𝄄   _Tiempo restante: ${diasRestantes > 0 ? `${diasRestantes} días` : 'Último día'}_\n\n`;
                
                mentions.push(ug.userId);
            });

            await sock.sendMessage(m.key.remoteJid, { text, mentions }, { quoted: m });
        } catch (err) {
            console.error('Error en !excusas:', err);
            reply(fmt.aviso('Error al listar las excusas.'));
        }
    }
};

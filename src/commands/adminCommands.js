const User = require('../models/User');
const UserGroup = require('../models/UserGroup');
const Pedido = require('../models/Pedido');
const Sugerencia = require('../models/Sugerencia');
const Config = require('../models/Config');
const fmt = require('../../format');
const { isAdmin, getUserId } = require('../utils');

module.exports = {
    antispam: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo admins.'));
        if (args[0] === 'on' || args[0] === 'off') {
            config.antispam.enabled = args[0] === 'on';
            await config.save();
            return reply(fmt.aviso(`Sistema anti-spam: ${config.antispam.enabled ? 'ENCENDIDO' : 'APAGADO'}`));
        }
        if (args.length >= 2 && !isNaN(args[0]) && !isNaN(args[1])) {
            config.antispam.limit = parseInt(args[0]);
            config.antispam.seconds = parseInt(args[1]);
            await config.save();
            return reply(fmt.aviso(`Configurado: ${config.antispam.limit} mjs en ${config.antispam.seconds} seg.`));
        }
        reply(fmt.aviso('Uso: !antispam on/off O !antispam [mjs] [seg]'));
    },

    adv: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        try {
            if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo admins.'));
            if (args.length < 2) return reply(fmt.aviso('Uso: !adv @user/personaje [razon]'));
            
            const targetId = await getUserId(args[0], m);
            if (!targetId) return reply(fmt.aviso('No se encontró al usuario.'));
            
            const razon = args.slice(1).join(' ');
            const u = await UserGroup.getOrCreate(targetId, groupId);
            u.advertencias.push({ razon, admin: sender });
            await u.save();

            const texto = fmt.aviso(`Advertencia añadida a @${targetId.split('@')[0]} (${u.advertencias.length}/${config.maxAdvertencias})\nMotivo: ${razon}`);
            await sock.sendMessage(m.key.remoteJid, { text: texto, mentions: [targetId] }, { quoted: m });
            
            if (u.advertencias.length >= config.maxAdvertencias) {
                const alertaTexto = fmt.aviso(`🚨 @${targetId.split('@')[0]} ha alcanzado el máximo de advertencias.`);
                await sock.sendMessage(m.key.remoteJid, { text: alertaTexto, mentions: [targetId] }, { quoted: m });
                
                // Remover del grupo automáticamente
                if (groupId.endsWith('@g.us')) {
                    try {
                        await sock.groupParticipantsUpdate(groupId, [targetId], 'remove');
                    } catch (err) {
                        console.error('Error al remover usuario del grupo:', err);
                    }
                }
            }
        } catch (err) {
            console.error('Error en !adv:', err);
            reply(fmt.aviso('Ocurrió un error al procesar el comando.'));
        }
    },

    advertencias: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        try {
            const users = await UserGroup.find({ groupId, 'advertencias.0': { $exists: true } }).sort({ fandom: 1, _id: 1 });
            if (users.length === 0) return reply(fmt.aviso('No hay advertencias en este grupo.'));

            let text = fmt.header();
            const grouped = {};
            users.forEach(ug => {
                if (!grouped[ug.fandom || 'Sin Fandom']) grouped[ug.fandom || 'Sin Fandom'] = [];
                grouped[ug.fandom || 'Sin Fandom'].push(ug);
            });

            let index = 1;
            for (const fandom in grouped) {
                text += fmt.listSection(fandom.toUpperCase());
                grouped[fandom].forEach(ug => {
                    text += fmt.listItem(`@${ug.userId.split('@')[0]} - ${ug.personaje} : ${ug.advertencias.length}/${config.maxAdvertencias}`);
                    ug.advertencias.forEach((adv, i) => {
                        text += `       𝄄   [${i + 1}] _- ${adv.razon}_\n`;
                    });
                    text += '\n';
                });
            }
            const mentions = users.map(ug => ug.userId);
            await sock.sendMessage(m.key.remoteJid, { text, mentions }, { quoted: m });
        } catch (err) {
            console.error('Error en !advertencias:', err);
            reply(fmt.aviso('Ocurrió un error al procesar el comando.'));
        }
    },

    quitar: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        try {
            if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo admins.'));
            if (!args[0]?.startsWith('#')) return reply(fmt.aviso('Uso: !quitar #numero [índice advertencia]'));
            const num = parseInt(args[0].slice(1)) - 1;
            const advIndex = args[1] ? parseInt(args[1]) - 1 : null;

            // Pedidos ordenados por fecha de creación
            const pedidos = await Pedido.find().sort({ fecha: 1 }).select('_id').lean();
            if (num < pedidos.length) {
                await Pedido.findByIdAndDelete(pedidos[num]._id);
                return reply(fmt.aviso(`Pedido #${num + 1} eliminado.`));
            }
            
            let currentOffset = pedidos.length;

            // Sugerencias ordenadas por fecha de creación
            const suges = await Sugerencia.find().sort({ fecha: 1 }).select('_id').lean();
            if (num < currentOffset + suges.length) {
                const sIdx = num - currentOffset;
                await Sugerencia.findByIdAndDelete(suges[sIdx]._id);
                return reply(fmt.aviso(`Sugerencia #${num + 1} eliminada.`));
            }
            
            currentOffset += suges.length;

            // Excusas ordenadas por userId y groupId
            const excusas = await UserGroup.find({ groupId, 'excusa.activa': true }).sort({ userId: 1 }).select('_id userId excusa personaje').lean();
            if (num < currentOffset + excusas.length) {
                const eIdx = num - currentOffset;
                const ug = excusas[eIdx];
                await UserGroup.findByIdAndUpdate(ug._id, { 'excusa.activa': false });
                return reply(fmt.aviso(`Excusa #${num + 1} (de ${ug.personaje}) eliminada.`));
            }

            currentOffset += excusas.length;

            // Usuarios con advertencias, ordenados para coincidir con el comando advertencias
            const usersWithAdv = await UserGroup.find({ groupId, 'advertencias.0': { $exists: true } }).sort({ fandom: 1, _id: 1 }).select('_id userId personaje advertencias').lean();
            if (num < currentOffset + usersWithAdv.length) {
                const uIdx = num - currentOffset;
                const ug = usersWithAdv[uIdx];
                
                if (advIndex !== null && advIndex >= 0 && advIndex < ug.advertencias.length) {
                    // Eliminar advertencia específica
                    const userGroupDoc = await UserGroup.findById(ug._id);
                    userGroupDoc.advertencias.splice(advIndex, 1);
                    await userGroupDoc.save();
                    return reply(fmt.aviso(`Advertencia #${advIndex + 1} de @${ug.userId.split('@')[0]} eliminada.`));
                } else {
                    // Eliminar última advertencia
                    const userGroupDoc = await UserGroup.findById(ug._id);
                    userGroupDoc.advertencias.pop(); 
                    await userGroupDoc.save();
                    return reply(fmt.aviso(`Última advertencia de @${ug.userId.split('@')[0]} eliminada.`));
                }
            }

            reply(fmt.aviso('No se encontró el elemento con ese número.'));
        } catch (err) {
            console.error('Error en !quitar:', err);
            reply(fmt.aviso('Ocurrió un error al procesar el comando.'));
        }
    }
};

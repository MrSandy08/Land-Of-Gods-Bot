const User = require('../models/User');
const UserGroup = require('../models/UserGroup');
const Pedido = require('../models/Pedido');
const Sugerencia = require('../models/Sugerencia');
const Config = require('../models/Config');
const fmt = require('../../format');
const { isAdmin, getUserId } = require('../utils');

module.exports = {
    antispam: async (sock, m, args, currentUser, config, reply) => {
        if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo admins.'));
        if (args[0] === 'on' || args[0] === 'off') {
            config.antispam.enabled = args[0] === 'on';
            await config.save();
            return reply(fmt.aviso(`Sistema anti-spam: ${config.antispam.enabled ? 'ENCENDIDO' : 'APAGADO'}`));
        }
        if (args.length >= 2) {
            config.antispam.limit = parseInt(args[0]);
            config.antispam.seconds = parseInt(args[1]);
            await config.save();
            return reply(fmt.aviso(`Configurado: ${config.antispam.limit} mjs en ${config.antispam.seconds} seg.`));
        }
        reply(fmt.aviso('Uso: !antispam on/off O !antispam [mjs] [seg]'));
    },

    adv: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo admins.'));
        if (args.length < 2) return reply(fmt.aviso('Uso: !adv @user/personaje [razon]'));
        
        const targetId = await getUserId(args[0], m);
        if (!targetId) return reply(fmt.aviso('No se encontró al usuario.'));
        
        const razon = args.slice(1).join(' ');
        const u = await UserGroup.getOrCreate(targetId, groupId);
        u.advertencias.push({ razon, admin: sender });
        await u.save();

        reply(fmt.aviso(`Advertencia añadida a @${targetId.split('@')[0]} (${u.advertencias.length}/${config.maxAdvertencias})\nMotivo: ${razon}`));
        
        if (u.advertencias.length >= config.maxAdvertencias) {
            reply(fmt.aviso(`🚨 @${targetId.split('@')[0]} ha alcanzado el máximo de advertencias.`));
        }
    },

    advertencias: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        const users = await UserGroup.find({ groupId, 'advertencias.0': { $exists: true } }).sort({ fandom: 1 });
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
                ug.advertencias.forEach(adv => {
                    text += `       𝄄   _- ${adv.razon}_\n`;
                });
                text += '\n';
            });
        }
        const mentions = users.map(ug => ug.userId);
        await sock.sendMessage(m.key.remoteJid, { text, mentions }, { quoted: m });
    },

    quitar: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
        if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo admins.'));
        if (!args[0]?.startsWith('#')) return reply(fmt.aviso('Uso: !quitar #numero'));
        const num = parseInt(args[0].slice(1)) - 1;

        const pedidos = await Pedido.find();
        if (num < pedidos.length) {
            await Pedido.findByIdAndDelete(pedidos[num]._id);
            return reply(fmt.aviso(`Pedido #${num + 1} eliminado.`));
        }
        
        let currentOffset = pedidos.length;

        const suges = await Sugerencia.find();
        if (num < currentOffset + suges.length) {
            const sIdx = num - currentOffset;
            await Sugerencia.findByIdAndDelete(suges[sIdx]._id);
            return reply(fmt.aviso(`Sugerencia #${num + 1} eliminada.`));
        }
        
        currentOffset += suges.length;

        const excusas = await UserGroup.find({ groupId, 'excusa.activa': true });
        if (num < currentOffset + excusas.length) {
            const eIdx = num - currentOffset;
            const ug = excusas[eIdx];
            ug.excusa.activa = false;
            await ug.save();
            return reply(fmt.aviso(`Excusa #${num + 1} (de ${ug.personaje}) eliminada.`));
        }

        currentOffset += excusas.length;

        const usersWithAdv = await UserGroup.find({ groupId, 'advertencias.0': { $exists: true } }).sort({ fandom: 1 });
        if (num < currentOffset + usersWithAdv.length) {
            const uIdx = num - currentOffset;
            const ug = usersWithAdv[uIdx];
            ug.advertencias.pop(); 
            await ug.save();
            return reply(fmt.aviso(`Advertencia de @${ug.userId.split('@')[0]} eliminada.`));
        }

        reply(fmt.aviso('No se encontró el elemento con ese número.'));
    }
};

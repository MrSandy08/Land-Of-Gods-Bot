const User = require('../models/User');
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

    adv: async (sock, m, args, currentUser, config, reply, sender) => {
        if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo admins.'));
        if (args.length < 2) return reply(fmt.aviso('Uso: !adv @user/personaje [razon]'));
        
        const targetId = await getUserId(args[0], m);
        if (!targetId) return reply(fmt.aviso('No se encontró al usuario.'));
        
        const razon = args.slice(1).join(' ');
        const u = await User.findById(targetId);
        u.advertencias.push({ razon, admin: sender });
        await u.save();

        reply(fmt.aviso(`Advertencia añadida a @${targetId.split('@')[0]} (${u.advertencias.length}/${config.maxAdvertencias})\nMotivo: ${razon}`));
        
        if (u.advertencias.length >= config.maxAdvertencias) {
            reply(fmt.aviso(`🚨 @${targetId.split('@')[0]} ha alcanzado el máximo de advertencias.`));
        }
    },

    advertencias: async (sock, m, args, currentUser, config, reply) => {
        const users = await User.find({ 'advertencias.0': { $exists: true } }).sort({ fandom: 1 });
        if (users.length === 0) return reply(fmt.aviso('No hay advertencias.'));

        let text = fmt.header() + '\n';
        const grouped = {};
        users.forEach(u => {
            if (!grouped[u.fandom || 'Sin Fandom']) grouped[u.fandom || 'Sin Fandom'] = [];
            grouped[u.fandom || 'Sin Fandom'].push(u);
        });

        let index = 1;
        for (const fandom in grouped) {
            text += fmt.listSection(fandom.toUpperCase());
            grouped[fandom].forEach(u => {
                text += fmt.listItem(`@${u._id.split('@')[0]} - ${u.personaje} : ${u.advertencias.length}/${config.maxAdvertencias}`);
                u.advertencias.forEach(adv => {
                    text += `       𝄄   _- ${adv.razon}_\n`;
                });
                text += '\n';
            });
        }
        reply(text);
    },

    quitar: async (sock, m, args, currentUser, config, reply) => {
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

        const excusas = await User.find({ 'excusa.activa': true });
        if (num < currentOffset + excusas.length) {
            const eIdx = num - currentOffset;
            const u = excusas[eIdx];
            u.excusa.activa = false;
            await u.save();
            return reply(fmt.aviso(`Excusa #${num + 1} (de ${u.personaje}) eliminada.`));
        }

        currentOffset += excusas.length;

        const usersWithAdv = await User.find({ 'advertencias.0': { $exists: true } }).sort({ fandom: 1 });
        if (num < currentOffset + usersWithAdv.length) {
            const uIdx = num - currentOffset;
            const u = usersWithAdv[uIdx];
            u.advertencias.pop(); 
            await u.save();
            return reply(fmt.aviso(`Advertencia de @${u._id.split('@')[0]} eliminada.`));
        }

        reply(fmt.aviso('No se encontró el elemento con ese número.'));
    }
};

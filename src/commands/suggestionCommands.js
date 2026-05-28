const Sugerencia = require('../models/Sugerencia');
const Pedido = require('../models/Pedido');
const fmt = require('../../format');

module.exports = {
    suge: async (sock, m, args, currentUser, config, reply, sender) => {
        if (args.length === 0) return reply(fmt.aviso('Uso: !suge [tu sugerencia]'));
        await Sugerencia.create({
            user: sender,
            personaje: currentUser.personaje || 'Sin personaje',
            contenido: args.join(' ')
        });
        reply(fmt.aviso('Sugerencia enviada correctamente.'));
    },

    sugerencia: async (sock, m, args, currentUser, config, reply, sender) => {
        if (args.length === 0) return reply(fmt.aviso('Uso: !suge [tu sugerencia]'));
        await Sugerencia.create({
            user: sender,
            personaje: currentUser.personaje || 'Sin personaje',
            contenido: args.join(' ')
        });
        reply(fmt.aviso('Sugerencia enviada correctamente.'));
    },

    sugerencias: async (sock, m, args, currentUser, config, reply) => {
        try {
            const suges = await Sugerencia.find().select('_id user personaje contenido').lean();
            if (suges.length === 0) return reply(fmt.aviso('No hay sugerencias.'));
            
            const pedidosCount = await Pedido.countDocuments();
            
            let text = fmt.header();
            text += fmt.listSection('BUZÓN DE SUGERENCIAS');
            const mentions = [];

            suges.forEach((s, i) => {
                const globalIndex = pedidosCount + i + 1;
                const jidClean = s.user.split('@')[0];
                text += fmt.listItem(`[#${globalIndex}] @${jidClean} - ${s.personaje}\n`) + `       𝄄   _${s.contenido}_\n\n`;
                mentions.push(s.user);
            });

            await sock.sendMessage(m.key.remoteJid, { text, mentions }, { quoted: m });
        } catch (err) {
            console.error('Error en !sugerencias:', err);
            reply(fmt.aviso('Error al cargar el buzón.'));
        }
    }
};

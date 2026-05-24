const Sugerencia = require('../models/Sugerencia');
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
        const suges = await Sugerencia.find();
        if (suges.length === 0) return reply(fmt.aviso('No hay sugerencias.'));
        let text = fmt.header();
        text += fmt.listSection('BUZÓN');
        suges.forEach((s, i) => {
            text += fmt.listItem(`@${s.user.split('@')[0]} - ${s.personaje}`) + `       𝄄   _${s.contenido}_\n\n`;
        });
        reply(text);
    }
};

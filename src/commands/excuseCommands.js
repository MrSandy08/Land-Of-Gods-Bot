const User = require('../models/User');
const moment = require('moment');
const fmt = require('../../format');
const { isAdmin, getUserId } = require('../utils');

module.exports = {
    excusa: async (sock, m, args, currentUser, config, reply) => {
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

        const u = await User.findById(targetId);
        u.excusa = {
            fin: moment().add(dias, 'days').toDate(),
            razon,
            activa: true
        };
        await u.save();

        reply(fmt.aviso(`Excusa puesta a @${targetId.split('@')[0]} por ${dias} días.\nMotivo: ${razon}`));
    },

    excusas: async (sock, m, args, currentUser, config, reply) => {
        const users = await User.find({ 'excusa.activa': true });
        if (users.length === 0) return reply(fmt.aviso('No hay excusas activas.'));

        let text = fmt.header();
        text += fmt.listSection('ACTUALES');
        users.forEach((u, i) => {
            const diasRestantes = moment(u.excusa.fin).diff(moment(), 'days');
            text += fmt.listItem(`@${u._id.split('@')[0]} - ${u.personaje} (${diasRestantes}d)`) + `       𝄄   _- ${u.excusa.razon}_\n\n`;
        });
        reply(text);
    }
};

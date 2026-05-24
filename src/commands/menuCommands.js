const fmt = require('../../format');
const { isAdmin } = require('../utils');

module.exports = {
    menu: async (sock, m, args, currentUser, config, reply) => {
        let text = fmt.header() + '\n';
        
        text += fmt.category('Personajes');
        text += fmt.cmdLine('🎭', 'personajes', 'Lista de personajes ocupados');
        text += fmt.cmdLine('👤', 'perfil', 'Ver tu perfil o el de otro');
        text += fmt.cmdLine('❓', 'sinpersonaje', 'Ver quiénes no tienen personaje');
        text += fmt.cmdLine('📩', 'pedir', 'Solicitar un personaje');
        text += fmt.cmdLine('📋', 'pedidos', 'Ver lista de pedidos');

        text += fmt.category('Actividad');
        text += fmt.cmdLine('🏆', 'top', 'Top mensajes del grupo');
        text += fmt.cmdLine('📉', 'low', 'Usuarios con menos mensajes');
        text += fmt.cmdLine('💤', 'inactivos', 'Ver usuarios inactivos');

        text += fmt.category('Reacciones');
        text += fmt.cmdLine('🤗', 'hug', 'Dar un abrazo a alguien');
        text += fmt.cmdLine('👋', 'slap', 'Dar una bofetada');
        text += fmt.cmdLine('🐾', 'pat', 'Acariciar la cabeza');
        text += fmt.cmdLine('👉', 'poke', 'Poke a alguien');
        text += fmt.cmdLine('💕', 'cuddle', 'Acurrucarse');
        text += fmt.cmdLine('💋', 'kiss', 'Dar un beso');
        text += fmt.cmdLine('🦷', 'bite', 'Morder');
        text += fmt.cmdLine('🙌', 'highfive', 'Choca esos cinco');
        text += fmt.cmdLine('💃', 'dance', 'Bailar juntos');
        text += fmt.cmdLine('👋', 'wave', 'Saludar');

        text += fmt.category('Sugerencias & Excusas');
        text += fmt.cmdLine('💡', 'suge', 'Enviar una sugerencia');
        text += fmt.cmdLine('📝', 'excusas', 'Ver lista de excusas activas');

        if (await isAdmin(m, sock)) {
            text += fmt.category('Administración');
            text += fmt.cmdLine('⚙️', 'asignar', 'Asignar personaje a alguien');
            text += fmt.cmdLine('⚠️', 'adv', 'Dar advertencia a un usuario');
            text += fmt.cmdLine('🚫', 'advertencias', 'Ver lista de advertencias');
            text += fmt.cmdLine('🛡️', 'antispam', 'Configurar sistema anti-spam');
            text += fmt.cmdLine('💊', 'excusa', 'Poner excusa a un miembro');
            text += fmt.cmdLine('🗑️', 'quitar', 'Quitar elemento por su #ID');
        }

        text += '\n' + fmt.aviso('Usa el prefijo ! antes de cada comando.');
        reply(text);
    }
};

const fmt = require('../../format');
const { isAdmin } = require('../utils');

module.exports = {
    menu: async (sock, m, args, currentUser, config, reply) => {
        let text = fmt.header();
        
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

        text += fmt.category('Economía');
        text += fmt.cmdLine('💰', 'dinero', 'Ver tu saldo o el de alguien');
        text += fmt.cmdLine('🎁', 'daily', 'Reclamar tu bono diario');
        text += fmt.cmdLine('💼', 'work', 'Trabajar (con probabilidades)');
        text += fmt.cmdLine('⛏️', 'minar', 'Minar para ganar más dinero');
        text += fmt.cmdLine('🎣', 'pescar', 'Pescar para ganar dinero');
        text += fmt.cmdLine('😈', 'robar', 'Robar a alguien (riesgo de prisión)');
        text += fmt.cmdLine('🏦', 'atracar', 'Atracar el banco (alto riesgo)');
        text += fmt.cmdLine('🏦', 'depositar', 'Depositar dinero en el banco');
        text += fmt.cmdLine('💸', 'retirar', 'Retirar dinero del banco');
        text += fmt.cmdLine('💱', 'transferir', 'Transferir dinero a alguien');
        text += fmt.cmdLine('🔓', 'fianza', 'Pagar fianza para salir de prisión');
        text += fmt.cmdLine('🏅', 'ricos', 'Ver el top de usuarios más ricos');

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

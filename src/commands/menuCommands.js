const fmt = require('../../format');
const { isAdmin } = require('../utils');

module.exports = {
    menu: async (sock, m, args, currentUser, config, reply) => {
        try {
            let text = fmt.header();
            
            text += fmt.category('Personajes');
            text += fmt.cmdLine('🎭', 'personajes', 'Lista de personajes ocupados');
            text += fmt.cmdLine('👤', 'perfil', 'Ver tu perfil o el de otro');
            text += fmt.cmdLine('❓', 'sinpersonaje', 'Ver quiénes no tienen personaje');
            text += fmt.cmdLine('📩', 'pedir', 'Solicitar un personaje');
            text += fmt.cmdLine('📋', 'pedidos', 'Ver lista de pedidos');

            text += fmt.category('Economía');
            text += fmt.cmdLine('💰', 'saldo', 'Ver tu saldo actual');
            text += fmt.cmdLine('💸', 'transferir', 'Transferir dinero a alguien');
            text += fmt.cmdLine('🛒', 'comprar', 'Comprar en una tienda');
            text += fmt.cmdLine('🏪', 'ver-tienda', 'Ver la tienda de alguien');

            text += fmt.category('Mi Tienda');
            text += fmt.cmdLine('🔓', 'mitienda abrir', 'Abrir tu tienda');
            text += fmt.cmdLine('🔒', 'mitienda cerrar', 'Cerrar tu tienda');
            text += fmt.cmdLine('🎨', 'mitienda diseño', 'Configurar el diseño de tu tienda');
            text += fmt.cmdLine('🖼️', 'mitienda set-banner', 'Establecer banner de tienda');
            text += fmt.cmdLine('➕', 'mitienda añadir', 'Añadir producto a tu tienda');

            text += fmt.category('Actividad');
            text += fmt.cmdLine('🏆', 'top', 'Top mensajes del grupo');
            text += fmt.cmdLine('📉', 'low', 'Usuarios con menos mensajes');
            text += fmt.cmdLine('💤', 'inactivos', 'Ver usuarios inactivos');

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
                text += fmt.cmdLine('💰', 'pagar', 'Dar dinero a un usuario');
                text += fmt.cmdLine('💵', 'cobrar', 'Quitar dinero a un usuario');
                text += fmt.cmdLine('✅', 'tienda aprobar', 'Aprobar la tienda de alguien');
            }

            text += '\n' + fmt.aviso('Usa el prefijo ! antes de cada comando.');
            reply(text);
        } catch (err) {
            console.error('Error en !menu:', err);
            reply(fmt.aviso('Ocurrió un error al cargar el menú.'));
        }
    }
};

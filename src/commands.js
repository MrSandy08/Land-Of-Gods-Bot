const menuCommands = require('./commands/menuCommands');
const characterCommands = require('./commands/characterCommands');
const activityCommands = require('./commands/activityCommands');
const adminCommands = require('./commands/adminCommands');
const suggestionCommands = require('./commands/suggestionCommands');
const excuseCommands = require('./commands/excuseCommands');
const economyCommands = require('./commands/economyCommands');

const UserGroup = require('./models/UserGroup');
const fmt = require('../format');

const handleCommand = async (sock, m, command, args, currentUser, globalConfig, groupConfig, groupId, sender) => {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith('@g.us')) {
        return;
    }

    // 1. Unir todos los comandos disponibles en un solo mapa
    const allCommands = {
        ...menuCommands,
        ...characterCommands,
        ...activityCommands,
        ...adminCommands,
        ...suggestionCommands,
        ...excuseCommands,
        ...economyCommands
    };

    // 2. Resolver comandos multi-palabra antes de definir el reply
    let comandoEjecutar = null;
    let argsRestantes = args;
    
    if (command === 'tienda' && args[0] === 'aprobar') {
        comandoEjecutar = 'tienda aprobar';
        argsRestantes = args.slice(1);
    }
    else if (command === 'mitienda') {
        const subcomando = args[0];
        const comandoCompleto = `mitienda ${subcomando}`;
        if (allCommands[comandoCompleto]) {
            comandoEjecutar = comandoCompleto;
            argsRestantes = args.slice(1);
        } else {
            comandoEjecutar = 'mitienda';
        }
    } else {
        comandoEjecutar = command;
    }

    // Si el comando no existe, salimos de inmediato
    if (!allCommands[comandoEjecutar]) {
        return;
    }

    // Usamos groupConfig si existe, de lo contrario globalConfig
    const configParaComando = groupConfig || globalConfig || {};

    // 3. Definición inteligente de la función REPLY
    const comandosConTexto = [
        'menu', 'top', 'low', 'inactivos', 'advertencias',
        'personajes', 'pedidos', 'sinpersonaje', 'sugerencias',
        'mitienda', 'tienda', 'saldo', 'mitienda diseñar', 'mitienda añadir'
    ];

    let reply;
    if (comandosConTexto.includes(comandoEjecutar)) {
        reply = async (text) => {
            return await sock.sendMessage(remoteJid, { text, mentions: [sender] }, { quoted: m });
        };
    } else {
        // Modificado para reaccionar con X y mandar texto en errores normales de comandos
        reply = async (text) => {
            const txt = text.toLowerCase();
            const esError = txt.includes('error') ||
                            txt.includes('inválido') ||
                            txt.includes('uso:') ||
                            txt.includes('solo admins') ||
                            txt.includes('insuficiente') ||
                            txt.includes('no se encontró') ||
                            txt.includes('no está activo');

            try {
                if (esError) {
                    // Reacciona con X al mensaje del usuario
                    await sock.sendMessage(remoteJid, { react: { text: '❌', key: m.key } });
                    // Y envía el texto explicativo
                    return await sock.sendMessage(remoteJid, { text: text }, { quoted: m });
                } else {
                    return await sock.sendMessage(remoteJid, { react: { text: '✅', key: m.key } });
                }
            } catch (err) {
                console.error('Error al reaccionar/responder:', err);
            }
        };
    }

    // === CONTROL DE ADMINISTRADORES (MODO SOLO ADMINS) ===
    const { isAdmin } = require('./utils');

    // 1. Comando para encender/apagar el modo restrictivo
    if (command === 'botmodoadmin') {
        try {
            if (!(await isAdmin(m, sock))) {
                // Si un usuario normal intenta usar este comando, solo le tiramos la X con el texto de error regular
                return reply(fmt.aviso('Solo los administradores del grupo pueden usar este comando.'));
            }

            // Cambiar el estado en el documento del grupo de la DB
            groupConfig.soloAdmins = !groupConfig.soloAdmins;
            await groupConfig.save();

            const estado = groupConfig.soloAdmins ? 'ACTIVADO 🔒 (Solo admins pueden usar el bot)' : 'DESACTIVADO 🔓 (Todos pueden usar el bot)';
            return sock.sendMessage(remoteJid, { text: fmt.aviso(`Configuración actualizada:\nEl modo administración está *${estado}*.`) }, { quoted: m });
        } catch (err) {
            console.error('Error en comando !botmodoadmin:', err);
            return reply(fmt.aviso('Ocurrió un error al cambiar la configuración del grupo.'));
        }
    }

    // 2. Bloqueo global estricto: Si está activo y NO es admin, SOLO pone la X y detiene todo
    if (groupConfig?.soloAdmins) {
        const usuarioEsAdmin = await isAdmin(m, sock);
        if (!usuarioEsAdmin) {
            try {
                // Coloca únicamente la reacción de la cruz roja en el mensaje del usuario
                return await sock.sendMessage(remoteJid, { react: { text: '❌', key: m.key } });
            } catch (err) {
                console.error('Error enviando reacción de bloqueo:', err);
            }
            return; // Frena por completo que el bot procese el comando o responda texto
        }
    }
    // ======================================================

    // 5. Ejecución segura del comando
    try {
        const userGroup = await UserGroup.getOrCreate(sender);
        await allCommands[comandoEjecutar](sock, m, argsRestantes, currentUser, configParaComando, reply, sender, groupId, userGroup);
    } catch (criticalErr) {
        console.error(`Error crítico ejecutando !${comandoEjecutar}:`, criticalErr);
        try {
            await sock.sendMessage(remoteJid, { react: { text: '❌', key: m.key } });
        } catch (_) {}
    }
};

module.exports = handleCommand;
module.exports.modoDiseñoTienda = economyCommands.modoDiseñoTienda;
module.exports.transaccionesPendientes = economyCommands.transaccionesPendientes;

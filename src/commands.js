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
        'mitienda', 'tienda', 'saldo', 'mitienda diseñar', 'mitienda añadir', 'perfil', 'botmodoadmin'
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

    // === BLOQUEO ESTRICTO DE MODO SOLO ADMINS (SILENCIOSO) ===
    if (groupConfig?.soloAdmins) {
        const { isAdmin } = require('./utils');
        const usuarioEsAdmin = await isAdmin(m, sock);
        
        // Si el modo está encendido y el comando NO es '!botmodoadmin' ni el usuario es admin...
        if (!usuarioEsAdmin && comandoEjecutar !== 'botmodoadmin') {
            try {
                // SOLO añade la reacción de la cruz roja en total silencio
                return await sock.sendMessage(remoteJid, { react: { text: '❌', key: m.key } });
            } catch (err) {
                console.error('Error enviando reacción de bloqueo:', err);
            }
            return; // Detiene la ejecución por completo
        }
    }
    // ========================================================

    // 5. Ejecución segura del comando
    try {
        // --- SOLUCIÓN EX-INTEGRANTES: Validar miembros actuales ---
        const metadata = await sock.groupMetadata(groupId).catch(() => null);
        if (!metadata) return; // Si no se puede leer el grupo, ignoramos

        const participantesActuales = metadata.participants.map(p => p.id);

        // Si el que ejecuta el comando ya no está en el grupo, no hacemos nada
        if (!participantesActuales.includes(sender)) {
            return;
        }

        // --- SOLUCIÓN CRUCE DE DATOS: Pasamos sender Y groupId para aislar el registro ---
        const userGroup = await UserGroup.getOrCreate(sender, groupId);
        
        // Ejecutamos el comando pasando la instancia limpia y aislada
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
const menuCommands = require('./commands/menuCommands');
const characterCommands = require('./commands/characterCommands');
const activityCommands = require('./commands/activityCommands');
const adminCommands = require('./commands/adminCommands');
const suggestionCommands = require('./commands/suggestionCommands');
const excuseCommands = require('./commands/excuseCommands');
const economyCommands = require('./commands/economyCommands');

const UserGroup = require('./models/UserGroup');

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

    // Si el comando no existe en nuestro bot, ignoramos el mensaje por completo y salimos
    if (!allCommands[comandoEjecutar]) {
        return;
    }

    // 3. Seleccionar la configuración correcta para el comando
    const comandosQueUsanGroupConfig = ['economy', 'mitienda', 'tienda', 'tienda aprobar', 'mitienda añadir', 'mitienda diseñar', 'comprar'];
    const configParaComando = comandosQueUsanGroupConfig.includes(comandoEjecutar) ? groupConfig : globalConfig;

    // 4. Definición inteligente de la función REPLY
    // Lista de comandos que obligatoriamente deben enviar texto/imágenes al chat
    const comandosConTexto = [
        'menu', 'top', 'low', 'inactivos', 'advertencias',
        'personajes', 'pedidos', 'sinpersonaje', 'sugerencias',
        'mitienda', 'tienda', 'saldo', 'mitienda diseñar', 'mitienda añadir'
    ];

    let reply;
    if (comandosConTexto.includes(comandoEjecutar)) {
        // Envia el texto normalizado al chat
        reply = async (text) => {
            return await sock.sendMessage(remoteJid, { text, mentions: [sender] }, { quoted: m });
        };
    } else {
        // Modo silencioso: intercepta el texto y lo convierte en reacción ✅ o ❌
        reply = async (text) => {
            const txt = text.toLowerCase();
            const esError = txt.includes('error') ||
                            txt.includes('inválido') ||
                            txt.includes('uso:') ||
                            txt.includes('solo admins') ||
                            txt.includes('insuficiente') ||
                            txt.includes('no se encontró') ||
                            txt.includes('no está activo');

            const emoji = esError ? '❌' : '✅';
            try {
                return await sock.sendMessage(remoteJid, { react: { text: emoji, key: m.key } });
            } catch (err) {
                console.error('Error al reaccionar:', err);
            }
        };
    }

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

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

    // --- CONFIGURACIÓN DE RESPUESTAS SILENCIOSAS ---
    // Comandos informativos extensos que SÍ deben enviar texto a la fuerza
    const comandosConTexto = [
        'menu', 'top', 'low', 'inactivos', 'advertencias',
        'personajes', 'pedidos', 'sinpersonaje', 'sugerencias',
        'mitienda', 'tienda', 'saldo'
    ];

    let reply;
    if (comandosConTexto.includes(command)) {
        // Mantiene el envío de menús, tops o visualización de tiendas de forma normal
        reply = async (text) => await sock.sendMessage(remoteJid, { text, mentions: [sender] }, { quoted: m });
    } else {
        // Reescribe el reply para comandos de acción (asignar, pagar, comprar, adv, etc.)
        reply = async (text) => {
            // Si el texto de respuesta contiene palabras de error, alerta o uso incorrecto, pone una equis
            const esError = text.toLowerCase().includes('error') ||
                            text.toLowerCase().includes('inválido') ||
                            text.toLowerCase().includes('uso:') ||
                            text.toLowerCase().includes('solo admins') ||
                            text.toLowerCase().includes('insuficiente') ||
                            text.toLowerCase().includes('no se encontró');

            const emoji = esError ? '❌' : '✅';
            
            try {
                await sock.sendMessage(remoteJid, {
                    react: { text: emoji, key: m.key }
                });
            } catch (err) {
                console.error('Error al enviar reacción silenciosa:', err);
            }
        };
    }
    // ------------------------------------------------

    const userGroup = await UserGroup.getOrCreate(sender);

    // Unir comandos de economía con el resto
    const allCommands = {
        ...menuCommands,
        ...characterCommands,
        ...activityCommands,
        ...adminCommands,
        ...suggestionCommands,
        ...excuseCommands,
        ...economyCommands
    };

    // Determinar qué config usar para este comando
    const comandosQueUsanGroupConfig = ['economy', 'mitienda', 'tienda', 'tienda aprobar', 'mitienda añadir', 'comprar'];
    const usarGroupConfig = comandosQueUsanGroupConfig.includes(command) || 
                            (command === 'tienda' && args[0] === 'aprobar') || 
                            (command === 'mitienda');

    const configParaComando = usarGroupConfig ? groupConfig : globalConfig;

    // Manejar comandos multi-palabra (ej: "mitienda abrir", "tienda aprobar")
    let comandoEjecutar = null;
    let argsRestantes = args;
    
    // Verificar "tienda aprobar"
    if (command === 'tienda' && args[0] === 'aprobar') {
        comandoEjecutar = 'tienda aprobar';
        argsRestantes = args.slice(1);
    } 
    // Verificar "mitienda" subcomandos (abrir, cerrar, diseño, set-banner, añadir, diseñar)
    else if (command === 'mitienda') {
        const subcomando = args[0];
        const comandoCompleto = `mitienda ${subcomando}`;
        if (allCommands[comandoCompleto]) {
            comandoEjecutar = comandoCompleto;
            argsRestantes = args.slice(1);
        } else {
            comandoEjecutar = 'mitienda';
        }
    }

    // Si encontramos un comando multi-palabra o base, ejecutarlo
    if (comandoEjecutar && allCommands[comandoEjecutar]) {
        // Aplicar también el comportamiento silencioso si es un subcomando de acción (como añadir o aprobar)
        if (!comandosConTexto.includes(comandoEjecutar) && comandoEjecutar !== 'mitienda') {
            const originalReply = reply;
            reply = async (text) => {
                const esError = text.toLowerCase().includes('error') || text.toLowerCase().includes('inválido');
                await sock.sendMessage(remoteJid, { react: { text: esError ? '❌' : '✅', key: m.key } });
            };
        }
        const cmdConfig = comandosQueUsanGroupConfig.includes(comandoEjecutar) ? groupConfig : globalConfig;
        await allCommands[comandoEjecutar](sock, m, argsRestantes, currentUser, cmdConfig, reply, sender, groupId, userGroup);
        return;
    }

    // Si no, ejecutar comando simple
    if (allCommands[command]) {
        await allCommands[command](sock, m, args, currentUser, configParaComando, reply, sender, groupId, userGroup);
    }
};

module.exports = handleCommand;
module.exports.modoDiseñoTienda = economyCommands.modoDiseñoTienda;
module.exports.transaccionesPendientes = economyCommands.transaccionesPendientes;

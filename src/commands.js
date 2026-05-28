const menuCommands = require('./commands/menuCommands');
const characterCommands = require('./commands/characterCommands');
const activityCommands = require('./commands/activityCommands');
const adminCommands = require('./commands/adminCommands');
const suggestionCommands = require('./commands/suggestionCommands');
const excuseCommands = require('./commands/excuseCommands');
const economyCommands = require('./commands/economyCommands');

const UserGroup = require('./models/UserGroup');

const handleCommand = async (sock, m, command, args, currentUser, config, groupId, sender) => {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith('@g.us')) {
        return;
    }

    const reply = async (text) => await sock.sendMessage(remoteJid, { text, mentions: [sender] }, { quoted: m });
    
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
            // Si no hay subcomando reconocido, ejecutar el comando base "mitienda"
            comandoEjecutar = 'mitienda';
        }
    }

    // Si encontramos un comando multi-palabra o base, ejecutarlo
    if (comandoEjecutar && allCommands[comandoEjecutar]) {
        await allCommands[comandoEjecutar](sock, m, argsRestantes, currentUser, config, reply, sender, groupId, userGroup);
        return;
    }

    // Si no, ejecutar comando simple (incluye "tienda" para ver la tienda de alguien)
    if (allCommands[command]) {
        await allCommands[command](sock, m, args, currentUser, config, reply, sender, groupId, userGroup);
    }
};

// Exportar las estructuras de memoria para index.js
module.exports = handleCommand;
module.exports.modoDiseñoTienda = economyCommands.modoDiseñoTienda;
module.exports.transaccionesPendientes = economyCommands.transaccionesPendientes;

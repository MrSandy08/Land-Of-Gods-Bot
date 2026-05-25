const menuCommands = require('./commands/menuCommands');
const characterCommands = require('./commands/characterCommands');
const activityCommands = require('./commands/activityCommands');
const adminCommands = require('./commands/adminCommands');
const suggestionCommands = require('./commands/suggestionCommands');
const excuseCommands = require('./commands/excuseCommands');
const economyCommands = require('./commands/economyCommands');

const handleCommand = async (sock, m, command, args, currentUser, config) => {
    const remoteJid = m.key.remoteJid;
    const sender = m.key.participant || remoteJid;
    const reply = async (text) => await sock.sendMessage(remoteJid, { text, mentions: [sender] }, { quoted: m });

    const allCommands = {
        ...menuCommands,
        ...characterCommands,
        ...activityCommands,
        ...adminCommands,
        ...suggestionCommands,
        ...excuseCommands,
        ...economyCommands
    };

    if (allCommands[command]) {
        await allCommands[command](sock, m, args, currentUser, config, reply, sender);
    }
};

module.exports = handleCommand;

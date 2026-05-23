const User = require('./models/User');

const isAdmin = async (m, sock) => {
    if (!m.key.remoteJid.endsWith('@g.us')) return false;
    const groupMetadata = await sock.groupMetadata(m.chat || m.key.remoteJid);
    const participants = groupMetadata.participants;
    const user = participants.find(p => p.id === (m.key.participant || m.key.remoteJid));
    return user && (user.admin === 'admin' || user.admin === 'superadmin');
};

const getUserId = async (text, m) => {
    if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        return m.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    if (text && text.includes('@s.whatsapp.net')) {
        return text.trim();
    }
    if (text) {
        const user = await User.findOne({ personaje: new RegExp(`^${text.trim()}$`, 'i') });
        if (user) return user._id;
    }
    return null;
};

module.exports = { isAdmin, getUserId };

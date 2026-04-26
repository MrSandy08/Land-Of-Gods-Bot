const User = require('./models/User');
const Pedido = require('./models/Pedido');
const Sugerencia = require('./models/Sugerencia');
const Config = require('./models/Config');
const moment = require('moment');
const fmt = require('../format');

// Función simple para verificar permisos
const isAdmin = async (m, sock) => {
    if (!m.key.remoteJid.endsWith('@g.us')) return false;
    const groupMetadata = await sock.groupMetadata(m.chat || m.key.remoteJid);
    const participants = groupMetadata.participants;
    const user = participants.find(p => p.id === (m.key.participant || m.key.remoteJid));
    return user && (user.admin === 'admin' || user.admin === 'superadmin');
};

// Helper para obtener ID de usuario desde mención o personaje
const getUserId = async (text, m) => {
    // 1. Verificar menciones
    if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        return m.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    // 2. Verificar si es un número/ID directo
    if (text && text.includes('@s.whatsapp.net')) {
        return text.trim();
    }
    // 3. Buscar por personaje
    if (text) {
        const user = await User.findOne({ personaje: new RegExp(`^${text.trim()}$`, 'i') });
        if (user) return user._id;
    }
    return null;
};

const handleCommand = async (sock, m, command, args, currentUser, config) => {
    const remoteJid = m.key.remoteJid;
    const sender = m.key.participant || remoteJid;
    const reply = async (text) => await sock.sendMessage(remoteJid, { text, mentions: [sender] }, { quoted: m });

    switch (command) {
        case 'menu': {
            let text = fmt.header('Menú de Organización') + '\n';
            
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
            break;
        }

        // --- GESTIÓN DE PERSONAJES ---
        case 'asignar': {
            if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo admins pueden usar este comando.'));
            if (args.length < 2) return reply(fmt.aviso('Uso: !asignar @user Personaje (Fandom)'));
            
            const targetId = await getUserId(args[0], m);
            if (!targetId) return reply(fmt.aviso('No se encontró al usuario.'));

            // Extraer personaje y fandom
            let fullText = args.slice(1).join(' ');
            let personaje = fullText;
            let fandom = 'General';
            
            const fandomMatch = fullText.match(/\(([^)]+)\)/);
            if (fandomMatch) {
                fandom = fandomMatch[1];
                personaje = fullText.replace(fandomMatch[0], '').trim();
            }

            // Verificar si el personaje ya está ocupado
            const existing = await User.findOne({ personaje: new RegExp(`^${personaje}$`, 'i'), fandom: new RegExp(`^${fandom}$`, 'i') });
            if (existing) return reply(fmt.aviso(`El personaje *${personaje}* (${fandom}) ya está ocupado por @${existing._id.split('@')[0]}.`));

            let targetUser = await User.findById(targetId);
            if (!targetUser) targetUser = new User({ _id: targetId });
            
            targetUser.personaje = personaje;
            targetUser.fandom = fandom;
            await targetUser.save();

            reply(fmt.aviso(`Personaje *${personaje}* (${fandom}) asignado a @${targetId.split('@')[0]}.`));
            break;
        }

        case 'personajes': {
            const users = await User.find({ personaje: { $ne: null } }).sort({ fandom: 1 });
            if (users.length === 0) return reply(fmt.aviso('No hay personajes asignados.'));

            let text = fmt.header('Lista de Personajes') + '\n';
            const grouped = {};
            users.forEach(u => {
                if (!grouped[u.fandom]) grouped[u.fandom] = [];
                grouped[u.fandom].push(u);
            });

            for (const fandom in grouped) {
                text += fmt.listSection(fandom.toUpperCase());
                grouped[fandom].forEach((u, i) => {
                    text += fmt.listItem(`${u.personaje} - @${u._id.split('@')[0]}`);
                });
                text += '\n';
            }
            reply(text);
            break;
        }

        case 'perfil': {
            const targetId = (args.length > 0) ? await getUserId(args[0], m) : sender;
            const u = await User.findById(targetId);
            if (!u) return reply(fmt.aviso('Usuario no encontrado.'));

            const diff = moment().diff(moment(u.lastSeen), 'days');
            let status = 'Activo';
            if (u.excusa?.activa) status = 'Con Excusa';
            else if (diff >= config.minInactividad) status = 'Inactivo';

            let text = fmt.header('Perfil de Usuario') + '\n';
            text += fmt.infoHeader();
            text += fmt.infoField('Personaje', u.personaje || 'Ninguno');
            text += fmt.infoField('Fandom', u.fandom || 'Ninguno');
            text += fmt.infoField('Mensajes', u.mensajes);
            text += fmt.infoField('Estado', status);
            text += fmt.infoField('Advertencias', `${u.advertencias.length}/${config.maxAdvertencias}`);
            text += fmt.infoField('Última vez', moment(u.lastSeen).fromNow());
            
            text += '\n\n' + fmt.aviso('Información actualizada.');
            reply(text);
            break;
        }

        case 'sinpersonaje': {
            const users = await User.find({ personaje: null });
            if (users.length === 0) return reply(fmt.aviso('Todos tienen personaje.'));
            
            let text = fmt.header('Sin Personaje') + '\n';
            text += fmt.listSection('USUARIOS');
            users.forEach((u, i) => {
                text += fmt.listItem(`@${u._id.split('@')[0]}`);
            });
            reply(text);
            break;
        }

        case 'pedir': {
            if (args.length < 1) return reply(fmt.aviso('Uso: !pedir Personaje (Fandom)'));
            let fullText = args.join(' ');
            let personaje = fullText;
            let fandom = 'General';
            
            const fandomMatch = fullText.match(/\(([^)]+)\)/);
            if (fandomMatch) {
                fandom = fandomMatch[1];
                personaje = fullText.replace(fandomMatch[0], '').trim();
            }

            await Pedido.create({ user: sender, personaje, fandom });
            reply(fmt.aviso(`Tu pedido para *${personaje}* (${fandom}) ha sido registrado.`));
            break;
        }

        case 'pedidos': {
            const pedidos = await Pedido.find().sort({ fandom: 1 });
            if (pedidos.length === 0) return reply(fmt.aviso('No hay pedidos pendientes.'));

            let text = fmt.header('Lista de Pedidos') + '\n';
            const grouped = {};
            pedidos.forEach(p => {
                if (!grouped[p.fandom]) grouped[p.fandom] = [];
                grouped[p.fandom].push(p);
            });

            for (const fandom in grouped) {
                text += fmt.listSection(fandom);
                grouped[fandom].forEach((p, i) => {
                    text += fmt.listItem(p.personaje);
                });
                text += '\n';
            }
            reply(text);
            break;
        }

        // --- ACTIVIDAD ---
        case 'top': {
            const limit = parseInt(args[0]) || 10;
            const top = await User.find().sort({ mensajes: -1 }).limit(limit);
            let text = fmt.header(`Top ${limit} Mensajes`) + '\n';
            text += fmt.listSection('RANKING');
            top.forEach((u, i) => {
                text += fmt.listItem(`@${u._id.split('@')[0]} - ${u.mensajes} mjs`);
            });
            reply(text);
            break;
        }

        case 'low': {
            const low = await User.find().sort({ mensajes: 1 }).limit(10);
            let text = fmt.header('Low 10 Mensajes') + '\n';
            text += fmt.listSection('RANKING');
            low.forEach((u, i) => {
                text += fmt.listItem(`@${u._id.split('@')[0]} - ${u.mensajes} mjs`);
            });
            reply(text);
            break;
        }

        case 'inactivos': {
            const days = parseInt(args[0]) || config.minInactividad;
            const threshold = moment().subtract(days, 'days').toDate();
            const inactivos = await User.find({ 
                lastSeen: { $lt: threshold },
                personaje: { $ne: null }
            });

            if (inactivos.length === 0) return reply(fmt.aviso(`No hay inactivos de ${days} días.`));

            let text = fmt.header(`Inactivos (${days}+ días)`) + '\n';
            text += fmt.listSection('USUARIOS');
            inactivos.forEach((u, i) => {
                const d = moment().diff(moment(u.lastSeen), 'days');
                text += fmt.listItem(`@${u._id.split('@')[0]} - ${u.personaje}`) + `       𝄄   _hace ${d} dias sin hablar_\n\n`;
            });
            reply(text);
            break;
        }

        case 'antispam': {
            if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo admins.'));
            if (args[0] === 'on' || args[0] === 'off') {
                config.antispam.enabled = args[0] === 'on';
                await config.save();
                return reply(fmt.aviso(`Sistema anti-spam: ${config.antispam.enabled ? 'ENCENDIDO' : 'APAGADO'}`));
            }
            if (args.length >= 2) {
                config.antispam.limit = parseInt(args[0]);
                config.antispam.seconds = parseInt(args[1]);
                await config.save();
                return reply(fmt.aviso(`Configurado: ${config.antispam.limit} mjs en ${config.antispam.seconds} seg.`));
            }
            reply(fmt.aviso('Uso: !antispam on/off O !antispam [mjs] [seg]'));
            break;
        }

        // --- ADVERTENCIAS ---
        case 'adv': {
            if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo admins.'));
            if (args.length < 2) return reply(fmt.aviso('Uso: !adv @user/personaje [razon]'));
            
            const targetId = await getUserId(args[0], m);
            if (!targetId) return reply(fmt.aviso('No se encontró al usuario.'));
            
            const razon = args.slice(1).join(' ');
            const u = await User.findById(targetId);
            u.advertencias.push({ razon, admin: sender });
            await u.save();

            reply(fmt.aviso(`Advertencia añadida a @${targetId.split('@')[0]} (${u.advertencias.length}/${config.maxAdvertencias})\nMotivo: ${razon}`));
            
            if (u.advertencias.length >= config.maxAdvertencias) {
                reply(fmt.aviso(`🚨 @${targetId.split('@')[0]} ha alcanzado el máximo de advertencias.`));
            }
            break;
        }

        case 'advertencias': {
            const users = await User.find({ 'advertencias.0': { $exists: true } }).sort({ fandom: 1 });
            if (users.length === 0) return reply(fmt.aviso('No hay advertencias.'));

            let text = fmt.header('Lista de Advertencias') + '\n';
            const grouped = {};
            users.forEach(u => {
                if (!grouped[u.fandom || 'Sin Fandom']) grouped[u.fandom || 'Sin Fandom'] = [];
                grouped[u.fandom || 'Sin Fandom'].push(u);
            });

            let index = 1;
            for (const fandom in grouped) {
                text += fmt.listSection(fandom.toUpperCase());
                grouped[fandom].forEach(u => {
                    text += fmt.listItem(`@${u._id.split('@')[0]} - ${u.personaje} : ${u.advertencias.length}/${config.maxAdvertencias}`);
                    u.advertencias.forEach(adv => {
                        text += `       𝄄   _- ${adv.razon}_\n`;
                    });
                    text += '\n';
                });
            }
            reply(text);
            break;
        }

        case 'quitar': {
            if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo admins.'));
            if (!args[0]?.startsWith('#')) return reply(fmt.aviso('Uso: !quitar #numero'));
            const num = parseInt(args[0].slice(1)) - 1;

            // 1. Buscar en Pedidos
            const pedidos = await Pedido.find();
            if (num < pedidos.length) {
                await Pedido.findByIdAndDelete(pedidos[num]._id);
                return reply(fmt.aviso(`Pedido #${num + 1} eliminado.`));
            }
            
            let currentOffset = pedidos.length;

            // 2. Buscar en Sugerencias
            const suges = await Sugerencia.find();
            if (num < currentOffset + suges.length) {
                const sIdx = num - currentOffset;
                await Sugerencia.findByIdAndDelete(suges[sIdx]._id);
                return reply(fmt.aviso(`Sugerencia #${num + 1} eliminada.`));
            }
            
            currentOffset += suges.length;

            // 3. Buscar en Excusas
            const excusas = await User.find({ 'excusa.activa': true });
            if (num < currentOffset + excusas.length) {
                const eIdx = num - currentOffset;
                const u = excusas[eIdx];
                u.excusa.activa = false;
                await u.save();
                return reply(fmt.aviso(`Excusa #${num + 1} (de ${u.personaje}) eliminada.`));
            }

            currentOffset += excusas.length;

            // 4. Buscar en Advertencias (por usuario)
            const usersWithAdv = await User.find({ 'advertencias.0': { $exists: true } }).sort({ fandom: 1 });
            if (num < currentOffset + usersWithAdv.length) {
                const uIdx = num - currentOffset;
                const u = usersWithAdv[uIdx];
                u.advertencias.pop(); 
                await u.save();
                return reply(fmt.aviso(`Advertencia de @${u._id.split('@')[0]} eliminada.`));
            }

            reply(fmt.aviso('No se encontró el elemento con ese número.'));
            break;
        }

        // --- SUGERENCIAS ---
        case 'suge':
        case 'sugerencia': {
            if (args.length === 0) return reply(fmt.aviso('Uso: !suge [tu sugerencia]'));
            await Sugerencia.create({
                user: sender,
                personaje: currentUser.personaje || 'Sin personaje',
                contenido: args.join(' ')
            });
            reply(fmt.aviso('Sugerencia enviada correctamente.'));
            break;
        }

        case 'sugerencias': {
            const suges = await Sugerencia.find();
            if (suges.length === 0) return reply(fmt.aviso('No hay sugerencias.'));
            let text = fmt.header('Sugerencias') + '\n';
            text += fmt.listSection('BUZÓN');
            suges.forEach((s, i) => {
                text += fmt.listItem(`@${s.user.split('@')[0]} - ${s.personaje}`) + `       𝄄   _${s.contenido}_\n\n`;
            });
            reply(text);
            break;
        }

        // --- EXCUSAS ---
        case 'excusa': {
            if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo admins.'));
            if (args.length < 2) return reply(fmt.aviso('Uso: !excusa @user/personaje [razon] [dias]'));
            
            const targetId = await getUserId(args[0], m);
            if (!targetId) return reply(fmt.aviso('No se encontró al usuario.'));

            let dias = 7;
            let razonArgs = args.slice(1);
            if (!isNaN(razonArgs[razonArgs.length - 1])) {
                dias = parseInt(razonArgs.pop());
            }
            const razon = razonArgs.join(' ');

            const u = await User.findById(targetId);
            u.excusa = {
                fin: moment().add(dias, 'days').toDate(),
                razon,
                activa: true
            };
            await u.save();

            reply(fmt.aviso(`Excusa puesta a @${targetId.split('@')[0]} por ${dias} días.\nMotivo: ${razon}`));
            break;
        }

        case 'excusas': {
            const users = await User.find({ 'excusa.activa': true });
            if (users.length === 0) return reply(fmt.aviso('No hay excusas activas.'));

            let text = fmt.header('Lista de Excusas') + '\n';
            text += fmt.listSection('ACTUALES');
            users.forEach((u, i) => {
                const diasRestantes = moment(u.excusa.fin).diff(moment(), 'days');
                text += fmt.listItem(`@${u._id.split('@')[0]} - ${u.personaje} (${diasRestantes}d)`) + `       𝄄   _- ${u.excusa.razon}_\n\n`;
            });
            reply(text);
            break;
        }
    }
};

module.exports = handleCommand;

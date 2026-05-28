// Cargar variables de entorno desde la raíz del proyecto
require('dotenv').config({ path: require('path').join(process.cwd(), '.env') });

const User = require('../models/User');
const Tienda = require('../models/Tienda');
const Group = require('../models/Group');
const { isAdmin } = require('../utils');
const axios = require('axios');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fmt = require('../../format');

// Almacén en memoria compartido con index.js
const modoDiseñoTienda = new Map();
const transaccionesPendientes = new Map();

// Función auxiliar para subir búfers de imágenes directamente a ImgBB
async function subirAImgBB(bufferImagen) {
  try {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('image', bufferImagen.toString('base64'));

    const apiKey = process.env.IMGBB_KEY;
    if (!apiKey) {
      console.error('❌ Falta la variable IMGBB_KEY en el entorno.');
      return '';
    }

    const response = await axios.post(`https://api.imgbb.com/1/upload?key=${apiKey}`, form, {
      headers: form.getHeaders(),
    });

    return response.data?.data?.url || '';
  } catch (error) {
    console.error('❌ Error al subir imagen a ImgBB:', error.message);
    return '';
  }
}

// Función auxiliar para limpiar texto (eliminar emojis, símbolos comunes y espacios)
function limpiarTexto(texto) {
  return texto
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}]|[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[*_~`•✨⚡️💥☄️🌌⚔️🛡️👑💰🛒🏪💎]/g, '')
    .trim();
}

module.exports = {
  // --- COMANDOS ADMINISTRATIVOS ---

  economy: async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      if (!(await isAdmin(m, sock))) return;

      const estado = args[0]?.toLowerCase();
      if (!estado || !['on', 'off'].includes(estado)) return;

      config.economy = (estado === 'on');
      
      // Force save to Group model
      await Group.findByIdAndUpdate(
        groupId,
        { economy: (estado === 'on') },
        { upsert: true, new: true }
      );

      await sock.sendMessage(groupId, {
        react: {
          text: '✅',
          key: m.key
        }
      });
    } catch (err) {
      console.error('Error en !economy:', err);
      try {
        await sock.sendMessage(groupId, { react: { text: '❌', key: m.key } });
      } catch (_) {}
    }
  },
  
  pagar: async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo admins.'));
      
      const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!mentionedJid || args.length < 2) return reply(fmt.aviso('Uso: !pagar @usuario [monto]'));

      const cantidad = parseInt(args[1]);
      if (isNaN(cantidad) || cantidad <= 0) return reply(fmt.aviso('Monto inválido.'));

      let usuario = await User.findById(mentionedJid);
      if (!usuario) usuario = new User({ _id: mentionedJid });
      usuario.saldo += cantidad;
      await usuario.save();

      await sock.sendMessage(m.key.remoteJid, { text: fmt.aviso(`Pagado @${mentionedJid.split('@')[0]} +${cantidad}`), mentions: [mentionedJid] }, { quoted: m });
    } catch (err) {
      console.error('Error en !pagar:', err);
      reply(fmt.aviso('Error al procesar el pago.'));
    }
  },

  cobrar: async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo admins.'));
      
      const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!mentionedJid || args.length < 2) return reply(fmt.aviso('Uso: !cobrar @usuario [monto]'));

      const cantidad = parseInt(args[1]);
      if (isNaN(cantidad) || cantidad <= 0) return reply(fmt.aviso('Monto inválido.'));

      let usuario = await User.findById(mentionedJid);
      if (!usuario) usuario = new User({ _id: mentionedJid });
      usuario.saldo = Math.max(0, usuario.saldo - cantidad);
      await usuario.save();

      await sock.sendMessage(m.key.remoteJid, { text: fmt.aviso(`Cobrado @${mentionedJid.split('@')[0]} -${cantidad}`), mentions: [mentionedJid] }, { quoted: m });
    } catch (err) {
      console.error('Error en !cobrar:', err);
      reply(fmt.aviso('Error al procesar el cobro.'));
    }
  },

  'tienda aprobar': async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      // Validar si la economía está encendida en este grupo
      if (!config || !config.economy) return reply(fmt.aviso('El sistema de tiendas no está activo en este grupo.'));
      if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo admins.'));
      
      const targetJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || sender;

      // Buscar por dueño Y grupo
      let tienda = await Tienda.findOne({ ownerId: targetJid, groupId: groupId });
      if (!tienda) {
        tienda = new Tienda({ ownerId: targetJid, groupId: groupId, diseñoLibre: '🏪 *Tienda en desarrollo*' });
      }
      tienda.aprobada = true;
      await tienda.save();

      await sock.sendMessage(m.key.remoteJid, { text: fmt.aviso(`Tienda de @${targetJid.split('@')[0]} aprobada con éxito en este grupo.`), mentions: [targetJid] }, { quoted: m });
    } catch (err) {
      console.error('Error en !tienda aprobar:', err);
      reply(fmt.aviso('Error al aprobar la tienda.'));
    }
  },

  // --- COMANDOS DE USUARIO ---
  
  saldo: async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      let usuario = await User.findById(sender);
      if (!usuario) usuario = new User({ _id: sender });
      
      await sock.sendMessage(m.key.remoteJid, {
        text: fmt.aviso(`Tu saldo actual es: ${usuario.saldo} monedas`),
        mentions: [sender]
      }, { quoted: m });
    } catch (err) {
      console.error('Error en !saldo:', err);
      reply(fmt.aviso('Error al obtener el saldo.'));
    }
  },

  transferir: async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!mentionedJid || args.length < 2) return reply(fmt.aviso('Uso: !transferir @usuario [monto]'));
      
      if (mentionedJid === sender) return reply(fmt.aviso('No te puedes transferir a ti mismo.'));

      const cantidad = parseInt(args[1]);
      if (isNaN(cantidad) || cantidad <= 0) return reply(fmt.aviso('Monto inválido.'));

      let emisor = await User.findById(sender);
      if (!emisor) emisor = new User({ _id: sender });
      
      if (emisor.saldo < cantidad) return reply(fmt.aviso('Saldo insuficiente.'));

      let receptor = await User.findById(mentionedJid);
      if (!receptor) receptor = new User({ _id: mentionedJid });

      emisor.saldo -= cantidad;
      receptor.saldo += cantidad;
      await emisor.save();
      await receptor.save();

      await sock.sendMessage(m.key.remoteJid, {
        text: fmt.aviso(`Transferencia exitosa de @${sender.split('@')[0]} a @${mentionedJid.split('@')[0]}: ${cantidad} monedas!`),
        mentions: [sender, mentionedJid]
      }, { quoted: m });
    } catch (err) {
      console.error('Error en !transferir:', err);
      reply(fmt.aviso('Error al procesar la transferencia.'));
    }
  },

  // --- GESTIÓN ÚNICA DE TIENDAS ---

  mitienda: async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      // Validar si la economía está encendida en este grupo
      if (!config || !config.economy) return reply(fmt.aviso('El sistema de tiendas no está activo en este grupo.'));

      const subcomando = args[0]?.toLowerCase();

      // Manejar comandos obsoletos
      if (['abrir', 'cerrar', 'diseño', 'set-banner'].includes(subcomando)) {
        return reply(fmt.aviso('Comando obsoleto. Ahora todo se hace usando de forma limpia: `!mitienda diseñar [texto]` (puedes adjuntar foto).'));
      }

      // Subcomando: !mitienda diseñar [texto]
      if (subcomando === 'diseñar') {
        const diseño = args.slice(1).join(' ');
        const tieneImagen = m.message?.imageMessage || 
                            m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

        if (!diseño && !tieneImagen) {
          return reply(fmt.aviso('Uso: !mitienda diseñar [texto de tu tienda] (Puedes adjuntar o citar una foto)'));
        }

        let tienda = await Tienda.findOne({ ownerId: sender, groupId: groupId });
        if (!tienda) tienda = new Tienda({ ownerId: sender, groupId: groupId });

        if (tieneImagen) {
          await sock.sendMessage(groupId, { text: '⏳ _Subiendo imagen de tu comercio a la nube..._' }, { quoted: m });
          try {
            let mediaMessage = m.message?.imageMessage ? m : { message: m.message.extendedTextMessage.contextInfo.quotedMessage };
            const buffer = await downloadMediaMessage(mediaMessage, 'buffer', {}, { logger: console });

            const urlSubida = await subirAImgBB(buffer);
            if (urlSubida) {
              tienda.imagenUrl = urlSubida;
            } else {
              return reply(fmt.aviso('No se pudo procesar la imagen. Inténtalo de nuevo.'));
            }
          } catch (errImg) {
            console.error('Error descargando multimedia:', errImg);
            return reply(fmt.aviso('Error crítico al procesar el archivo de imagen.'));
          }
        }

        if (diseño) {
          tienda.diseñoLibre = diseño;
        }

        await tienda.save();
        return reply('✅ ¡La información visual de tu tienda en este grupo ha sido actualizada!');
      }

      // Visualización base limpia de !mitienda (Filtrado por Grupo)
      let tienda = await Tienda.findOne({ ownerId: sender, groupId: groupId });
      if (!tienda) {
        tienda = new Tienda({
          ownerId: sender,
          groupId: groupId,
          diseñoLibre: '🏪 *Nueva Tienda del Olimpo*\n\nUsa `!mitienda diseñar [Productos]` para darle estética.'
        });
        await tienda.save();
      }

      const textoFinal = `${tienda.diseñoLibre}`;

      if (tienda.imagenUrl) {
        await sock.sendMessage(groupId, {
          image: { url: tienda.imagenUrl },
          caption: textoFinal,
          mentions: [sender]
        }, { quoted: m });
      } else {
        await sock.sendMessage(groupId, { text: textoFinal, mentions: [sender] }, { quoted: m });
      }

    } catch (err) {
      console.error('Error en !mitienda:', err);
      reply(fmt.aviso('Error al cargar la gestión de tu tienda.'));
    }
  },

  tienda: async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      if (args[0] === 'aprobar') return;
      // Validar si la economía está encendida en este grupo
      if (!config || !config.economy) return reply(fmt.aviso('El sistema de tiendas no está activo en este grupo.'));

      const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!mentionedJid) return reply(fmt.aviso('Uso: !tienda @usuario'));

      // Buscar tienda del usuario específica de este grupo
      const tienda = await Tienda.findOne({ ownerId: mentionedJid, groupId: groupId });
      if (!tienda || !tienda.aprobada) {
        return reply(fmt.aviso('Este usuario no posee una tienda registrada o activa en este grupo.'));
      }

      const jidClean = mentionedJid.split('@')[0];
      const textoAMostrar = `${tienda.diseñoLibre}\n\n🛒 _Para comprar usa: !comprar @${jidClean} [Producto]_`;

      if (tienda.imagenUrl) {
        await sock.sendMessage(groupId, {
          image: { url: tienda.imagenUrl },
          caption: textoAMostrar,
          mentions: [mentionedJid]
        }, { quoted: m });
      } else {
        await sock.sendMessage(groupId, { text: textoAMostrar, mentions: [mentionedJid] }, { quoted: m });
      }
    } catch (err) {
      console.error('Error en !tienda:', err);
      reply(fmt.aviso('Error al obtener la tienda del usuario.'));
    }
  },

  'mitienda añadir': async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      // Validar si la economía está encendida en este grupo
      if (!config || !config.economy) return reply(fmt.aviso('El sistema de tiendas no está activo en este grupo.'));
      if (args.length < 1) return reply(fmt.aviso('Uso: !mitienda añadir [Producto - Precio]'));
      
      const fullText = args.join(' ');
      const nuevoProductoMatch = fullText.match(/^(.+) - (\d+)$/);
      if (!nuevoProductoMatch) {
        return reply(fmt.aviso('Formato inválido. Usa: [Nombre] - [Precio]'));
      }
      const [, nuevoNombre, nuevoPrecioStr] = nuevoProductoMatch;
      const nuevoPrecio = parseInt(nuevoPrecioStr);

      let tienda = await Tienda.findOne({ ownerId: sender, groupId: groupId });
      if (!tienda) tienda = new Tienda({ ownerId: sender, groupId: groupId });

      const lineas = tienda.diseñoLibre.split('\n').filter(linea => linea.trim() !== '');
      
      let prefijo = '';
      let sufijo = '';
      const regexProducto = /^(.+?)(.+) - (\d+)(.*)$/;
      
      for (let i = lineas.length - 1; i >= 0; i--) {
        const match = lineas[i].match(regexProducto);
        if (match) {
          prefijo = match[1];
          sufijo = match[4];
          break;
        }
      }

      const nuevaLinea = `${prefijo}${nuevoNombre} - ${nuevoPrecio}${sufijo}`;
      tienda.diseñoLibre = tienda.diseñoLibre ? `${tienda.diseñoLibre}\n${nuevaLinea}` : nuevaLinea;
      await tienda.save();
      
      reply(fmt.aviso('Producto añadido exitosamente a tu diseño en este grupo!'));
    } catch (err) {
      console.error('Error en !mitienda añadir:', err);
      reply(fmt.aviso('Error al procesar el producto.'));
    }
  },

  // --- COMPRA INTELIGENTE LIBRE DE ADORNOS ---
  
  comprar: async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      // Validar si la economía está encendida en este grupo
      if (!config || !config.economy) return reply(fmt.aviso('El sistema de tiendas no está activo en este grupo.'));

      const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!mentionedJid) return reply(fmt.aviso('Uso: !comprar @vendedor [Nombre del Producto]'));

      const nombreProductoBuscado = args.slice(1).join(' ');
      if (!nombreProductoBuscado) return reply(fmt.aviso('Especifica el producto que deseas adquirir.'));

      if (sender === mentionedJid) return reply(fmt.aviso('No puedes comprar en tu propia tienda.'));

      // Buscar tienda asociada específicamente al grupo actual
      const tienda = await Tienda.findOne({ ownerId: mentionedJid, groupId: groupId });
      if (!tienda || !tienda.aprobada) return reply(fmt.aviso('Este comercio no está activo en este grupo.'));

      const lineasTienda = tienda.diseñoLibre.split('\n');
      let productoEncontrado = null;
      let precioProducto = 0;

      const busquedaLimpia = limpiarTexto(nombreProductoBuscado);

      for (let linea of lineasTienda) {
        if (!linea.includes('-')) continue;

        const partes = linea.split('-');
        const nombreItemOriginal = partes[0];
        const precioYMas = partes[1];

        const nombreItemLimpio = limpiarTexto(nombreItemOriginal);

        if (nombreItemLimpio.includes(busquedaLimpia) || busquedaLimpia.includes(nombreItemLimpio)) {
          const matchPrecio = precioYMas.match(/\d+/);
          if (matchPrecio) {
            productoEncontrado = nombreItemOriginal.replace(/[*_~`]/g, '').trim();
            precioProducto = parseInt(matchPrecio[0]);
            break;
          }
        }
      }

      if (!productoEncontrado || precioProducto <= 0) {
        return reply(fmt.aviso(`El artículo "${nombreProductoBuscado}" no coincide con ningún producto listado en esta tienda.`));
      }

      let comprador = await User.findById(sender);
      if (!comprador) comprador = new User({ _id: sender });
      
      if (comprador.saldo < precioProducto) {
        return reply(fmt.aviso(`Saldo insuficiente. Necesitas *${precioProducto} monedas* y tienes *${comprador.saldo}*.`));
      }

      const mensajeConfirmacion = await sock.sendMessage(groupId, {
        text: `💰 @${mentionedJid.split('@')[0]}, el usuario @${sender.split('@')[0]} desea adquirir:\n📦 *Producto:* ${productoEncontrado}\n🪙 *Precio:* ${precioProducto} monedas.\n\n_Responde a este mensaje con *!aceptar* para entregar el producto y cobrar, o *!rechazar* para cancelar la venta._`,
        mentions: [mentionedJid, sender]
      }, { quoted: m });

      if (transaccionesPendientes) {
        transaccionesPendientes.set(mensajeConfirmacion.key.id, {
          compradorId: sender,
          vendedorId: mentionedJid,
          monto: precioProducto,
          producto: productoEncontrado,
          messageId: mensajeConfirmacion.key.id
        });
      }
      
    } catch (err) {
      console.error('Error en !comprar:', err);
      reply(fmt.aviso('Ocurrió un error al procesar la compra.'));
    }
  }
};

module.exports.modoDiseñoTienda = modoDiseñoTienda;
module.exports.transaccionesPendientes = transaccionesPendientes;

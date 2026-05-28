// Cargar variables de entorno desde la raíz del proyecto
require('dotenv').config({ path: require('path').join(process.cwd(), '.env') });

const User = require('../models/User');
const Tienda = require('../models/Tienda');
const Group = require('../models/Group'); // Usando tu modelo de grupo real
const { isAdmin } = require('../utils');
const axios = require('axios');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fmt = require('../../format');

const modoDiseñoTienda = new Map();
const transaccionesPendientes = new Map();

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

function limpiarTexto(texto) {
  return texto
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}]|[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[*_~`•✨⚡️💥☄️🌌⚔️🛡️👑💰🛒🏪💎]/g, '')
    .trim();
}

module.exports = {
  economy: async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      if (!(await isAdmin(m, sock))) return;

      const estado = args[0]?.toLowerCase();
      if (!estado || !['on', 'off'].includes(estado)) return;

      // Cambiar en caliente en el objeto de memoria actual
      config.economy = (estado === 'on');

      // Guardar de forma persistente en tu base de datos usando tu modelo 'Group'
      await Group.findByIdAndUpdate(
        groupId,
        { $set: { economy: (estado === 'on') } },
        { upsert: true }
      );

      await sock.sendMessage(groupId, { react: { text: '✅', key: m.key } });
    } catch (err) {
      console.error('Error en !economy:', err);
      try { await sock.sendMessage(groupId, { react: { text: '❌', key: m.key } }); } catch (_) {}
    }
  },

  pagar: async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      if (!(await isAdmin(m, sock))) return;
      
      const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!mentionedJid || args.length < 2) return reply(fmt.aviso('Uso: !pagar @usuario [monto]'));

      const cantidad = parseInt(args[1]);
      if (isNaN(cantidad) || cantidad <= 0) return reply(fmt.aviso('Monto inválido.'));

      let usuario = await User.findById(mentionedJid);
      if (!usuario) usuario = new User({ _id: mentionedJid });
      usuario.saldo += cantidad;
      await usuario.save();

      return reply('✅');
    } catch (err) {
      console.error('Error en !pagar:', err);
    }
  },

  cobrar: async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      if (!(await isAdmin(m, sock))) return;
      
      const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!mentionedJid || args.length < 2) return reply(fmt.aviso('Uso: !cobrar @usuario [monto]'));

      const cantidad = parseInt(args[1]);
      if (isNaN(cantidad) || cantidad <= 0) return reply(fmt.aviso('Monto inválido.'));

      let usuario = await User.findById(mentionedJid);
      if (!usuario) usuario = new User({ _id: mentionedJid });
      usuario.saldo = Math.max(0, usuario.saldo - cantidad);
      await usuario.save();

      return reply('✅');
    } catch (err) {
      console.error('Error en !cobrar:', err);
    }
  },

  'tienda aprobar': async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      if (!config || !config.economy) return reply(fmt.aviso('El sistema de tiendas no está activo en este grupo.'));
      if (!(await isAdmin(m, sock))) return;
      
      const targetJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || sender;

      let tienda = await Tienda.findOne({ ownerId: targetJid, groupId: groupId });
      if (!tienda) {
        tienda = new Tienda({ ownerId: targetJid, groupId: groupId, diseñoLibre: '🏪 *Tienda en desarrollo*' });
      }
      tienda.aprobada = true;
      await tienda.save();

      return reply('✅');
    } catch (err) {
      console.error('Error en !tienda aprobar:', err);
    }
  },

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

      return reply('✅');
    } catch (err) {
      console.error('Error en !transferir:', err);
    }
  },

  mitienda: async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      if (!config || !config.economy) return reply(fmt.aviso('El sistema de tiendas no está activo en este grupo.'));

      const subcomando = args[0]?.toLowerCase();

      if (['abrir', 'cerrar', 'diseño', 'set-banner'].includes(subcomando)) {
        return reply(fmt.aviso('Comando obsoleto. Usa: `!mitienda diseñar [texto]`'));
      }

      if (subcomando === 'diseñar') {
        // 1. Capturar todo el texto de origen para preservar saltos de línea (\n) perfectamente
        const textoOriginal = m.message?.conversation ||
                              m.message?.extendedTextMessage?.text ||
                              m.message?.imageMessage?.caption ||
                              m.message?.viewOnceMessage?.message?.imageMessage?.caption ||
                              m.message?.ephemeralMessage?.message?.imageMessage?.caption ||
                              "";

        const lowerText = textoOriginal.toLowerCase();
        const indexDisenar = lowerText.indexOf('diseñar');
        let diseño = '';
        
        // Cortar el texto justo después de la palabra "diseñar"
        if (indexDisenar !== -1) {
          diseño = textoOriginal.substring(indexDisenar + 'diseñar'.length).trim();
        }

        // 2. Detección profunda de imágenes (Directas, Ver una vez, Efímeras o Citadas)
        const imgMessage = m.message?.imageMessage ||
                           m.message?.viewOnceMessage?.message?.imageMessage ||
                           m.message?.ephemeralMessage?.message?.imageMessage;

        const contextInfo = m.message?.extendedTextMessage?.contextInfo ||
                            m.message?.imageMessage?.contextInfo ||
                            m.message?.viewOnceMessage?.message?.imageMessage?.contextInfo;

        const quotedMessage = contextInfo?.quotedMessage;
        const quotedImgMessage = quotedMessage?.imageMessage ||
                                 quotedMessage?.viewOnceMessage?.message?.imageMessage ||
                                 quotedMessage?.ephemeralMessage?.message?.imageMessage;

        const tieneImagen = imgMessage || quotedImgMessage;

        if (!diseño && !tieneImagen) {
          return reply(fmt.aviso('Uso: !mitienda diseñar [Productos/Descripción] (Puedes adjuntar o responder a una foto)'));
        }

        let tienda = await Tienda.findOne({ ownerId: sender, groupId: groupId });
        if (!tienda) tienda = new Tienda({ ownerId: sender, groupId: groupId });

        // 3. Procesamiento seguro del archivo multimedia
        if (tieneImagen) {
          await sock.sendMessage(groupId, { text: '⏳ _Procesando y subiendo imagen..._' }, { quoted: m });
          try {
            let mediaMessage = imgMessage ? m : { message: quotedMessage };
            const buffer = await downloadMediaMessage(mediaMessage, 'buffer', {}, { logger: console });

            if (buffer) {
              const urlSubida = await subirAImgBB(buffer);
              if (urlSubida) tienda.imagenUrl = urlSubida;
            }
          } catch (errImg) {
            console.error('Error descargando imagen:', errImg);
            return reply(fmt.aviso('Error al procesar el archivo de imagen.'));
          }
        }

        // 4. Guardar el diseño de texto si fue provisto
        if (diseño) {
          tienda.diseñoLibre = diseño;
        }
        
        await tienda.save();
        return reply('✅');
      }

      // --- MOSTRAR TIENDA (Si solo se ejecuta !mitienda) ---
      let tienda = await Tienda.findOne({ ownerId: sender, groupId: groupId });
      if (!tienda) {
        tienda = new Tienda({
          ownerId: sender,
          groupId: groupId,
          diseñoLibre: '🏪 *Nueva Tienda del Olimpo*\n\nUsa `!mitienda diseñar [Productos]` para darle estética.'
        });
        await tienda.save();
      }

      if (tienda.imagenUrl) {
        await sock.sendMessage(groupId, { image: { url: tienda.imagenUrl }, caption: tienda.diseñoLibre, mentions: [sender] }, { quoted: m });
      } else {
        await sock.sendMessage(groupId, { text: tienda.diseñoLibre, mentions: [sender] }, { quoted: m });
      }
    } catch (err) {
      console.error('Error en !mitienda:', err);
    }
  },

  tienda: async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      if (args[0] === 'aprobar') return;
      if (!config || !config.economy) return reply(fmt.aviso('El sistema de tiendas no está activo en este grupo.'));

      const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!mentionedJid) return reply(fmt.aviso('Uso: !tienda @usuario'));

      const tienda = await Tienda.findOne({ ownerId: mentionedJid, groupId: groupId });
      if (!tienda || !tienda.aprobada) {
        return reply(fmt.aviso('Este usuario no posee una tienda registrada o activa en este grupo.'));
      }

      const jidClean = mentionedJid.split('@')[0];
      const textoAMostrar = `${tienda.diseñoLibre}\n\n🛒 _Para comprar usa: !comprar @${jidClean} [Producto]_`;

      if (tienda.imagenUrl) {
        await sock.sendMessage(groupId, { image: { url: tienda.imagenUrl }, caption: textoAMostrar, mentions: [mentionedJid] }, { quoted: m });
      } else {
        await sock.sendMessage(groupId, { text: textoAMostrar, mentions: [mentionedJid] }, { quoted: m });
      }
    } catch (err) {
      console.error('Error en !tienda:', err);
    }
  },

  'mitienda añadir': async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      if (!config || !config.economy) return reply(fmt.aviso('El sistema de tiendas no está activo en este grupo.'));
      if (args.length < 1) return reply(fmt.aviso('Uso: !mitienda añadir [Producto - Precio]'));
      
      const fullText = args.join(' ');
      const nuevoProductoMatch = fullText.match(/^(.+) - (\d+)$/);
      if (!nuevoProductoMatch) return reply(fmt.aviso('Formato inválido. Usa: [Nombre] - [Precio]'));

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
      
      return reply('✅');
    } catch (err) {
      console.error('Error en !mitienda añadir:', err);
    }
  },

  comprar: async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      if (!config || !config.economy) return reply(fmt.aviso('El sistema de tiendas no está activo en este grupo.'));

      const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!mentionedJid) return reply(fmt.aviso('Uso: !comprar @vendedor [Producto]'));

      const nombreProductoBuscado = args.slice(1).join(' ');
      if (!nombreProductoBuscado) return reply(fmt.aviso('Especifica el producto.'));
      if (sender === mentionedJid) return reply(fmt.aviso('No puedes comprar en tu propia tienda.'));

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
        if (limpiarTexto(nombreItemOriginal).includes(busquedaLimpia)) {
          const matchPrecio = precioYMas.match(/\d+/);
          if (matchPrecio) {
            productoEncontrado = nombreItemOriginal.replace(/[*_~`]/g, '').trim();
            precioProducto = parseInt(matchPrecio[0]);
            break;
          }
        }
      }

      if (!productoEncontrado || precioProducto <= 0) {
        return reply(fmt.aviso(`El artículo "${nombreProductoBuscado}" no coincide con ningún producto listado.`));
      }

      let comprador = await User.findById(sender);
      if (!comprador) comprador = new User({ _id: sender });
      if (comprador.saldo < precioProducto) return reply(fmt.aviso(`Saldo insuficiente (${comprador.saldo}/${precioProducto}).`));

      const mensajeConfirmacion = await sock.sendMessage(groupId, {
        text: `💰 @${mentionedJid.split('@')[0]}, el usuario @${sender.split('@')[0]} desea adquirir:\n📦 *Producto:* ${productoEncontrado}\n🪙 *Precio:* ${precioProducto} monedas.\n\n_Responde con *!aceptar* o *!rechazar*._`,
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
    }
  }
};

module.exports.modoDiseñoTienda = modoDiseñoTienda;
module.exports.transaccionesPendientes = transaccionesPendientes;

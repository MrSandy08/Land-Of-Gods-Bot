// Cargar variables de entorno desde la raíz del proyecto
require('dotenv').config({ path: require('path').join(process.cwd(), '.env') });
console.log("✅ Clave IMGBB_KEY cargada en commands:", process.env.IMGBB_KEY);

const User = require('../models/User');
const Tienda = require('../models/Tienda');
const { isAdmin } = require('../utils');
const axios = require('axios');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fmt = require('../../format');

// Almacén en memoria para:
// 1. Usuarios en modo "diseño de tienda"
// 2. Transacciones pendientes de compra (key: messageId, value: transacción)
const modoDiseñoTienda = new Map(); // { userId: true }
const transaccionesPendientes = new Map(); // { messageId: { compradorId, vendedorId, monto, producto } }

module.exports = {
  // --- COMANDOS ADMINISTRATIVOS ---
  pagar: async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo admins.'));
      
      // Extraer JID de la mención (Baileys seguridad)
      const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!mentionedJid || args.length < 2) return reply(fmt.aviso('Uso: !pagar @usuario [monto]'));

      const cantidad = parseInt(args[1]);
      if (isNaN(cantidad) || cantidad <= 0) return reply(fmt.aviso('Monto inválido.'));

      // Obtener/crear usuario y actualizar saldo
      let usuario = await User.findById(mentionedJid);
      if (!usuario) usuario = new User({ _id: mentionedJid });
      usuario.saldo += cantidad;
      await usuario.save();

      await sock.sendMessage(m.key.remoteJid, { text: fmt.aviso(`Pagado @${mentionedJid.split('@')[0]} +${cantidad}`), mentions: [mentionedJid] }, { quoted: m });
    } catch (err) {
      console.error('Error en !pagar:', err);
      reply(fmt.aviso('Error al procesar.'));
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
      usuario.saldo = Math.max(0, usuario.saldo - cantidad); // No permitir saldo negativo
      await usuario.save();

      await sock.sendMessage(m.key.remoteJid, { text: fmt.aviso(`Cobrado @${mentionedJid.split('@')[0]} -${cantidad}`), mentions: [mentionedJid] }, { quoted: m });
    } catch (err) {
      console.error('Error en !cobrar:', err);
      reply(fmt.aviso('Error al procesar.'));
    }
  },

  'tienda aprobar': async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      if (!(await isAdmin(m, sock))) return reply(fmt.aviso('Solo admins.'));
      
      const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!mentionedJid) return reply(fmt.aviso('Uso: !tienda aprobar @usuario'));

      let tienda = await Tienda.findOne({ ownerId: mentionedJid });
      if (!tienda) {
        tienda = new Tienda({ ownerId: mentionedJid });
      }
      tienda.aprobada = true;
      await tienda.save();

      await sock.sendMessage(m.key.remoteJid, { text: fmt.aviso(`Tienda de @${mentionedJid.split('@')[0]} aprobada!`), mentions: [mentionedJid] }, { quoted: m });
    } catch (err) {
      console.error('Error en !tienda aprobar:', err);
      reply(fmt.aviso('Error al procesar.'));
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
      reply(fmt.aviso('Error al procesar.'));
    }
  },

  transferir: async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!mentionedJid || args.length < 2) return reply(fmt.aviso('Uso: !transferir @usuario [monto]'));
      
      if (mentionedJid === sender) return reply(fmt.aviso('No te puedes transferir a ti mismo.'));

      const cantidad = parseInt(args[1]);
      if (isNaN(cantidad) || cantidad <= 0) return reply(fmt.aviso('Monto inválido.'));

      // Obtener usuarios
      let emisor = await User.findById(sender);
      if (!emisor) emisor = new User({ _id: sender });
      
      if (emisor.saldo < cantidad) return reply(fmt.aviso('Saldo insuficiente.'));

      let receptor = await User.findById(mentionedJid);
      if (!receptor) receptor = new User({ _id: mentionedJid });

      // Realizar transferencia
      emisor.saldo -= cantidad;
      receptor.saldo += cantidad;
      await emisor.save();
      await receptor.save();

      await sock.sendMessage(m.key.remoteJid, {
        text: fmt.aviso(`Transferencia de @${sender.split('@')[0]} a @${mentionedJid.split('@')[0]}: ${cantidad} monedas!`),
        mentions: [sender, mentionedJid]
      }, { quoted: m });
    } catch (err) {
      console.error('Error en !transferir:', err);
      reply(fmt.aviso('Error al procesar.'));
    }
  },

  // --- GESTIÓN DE TIENDA ---
  'mitienda abrir': async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      let tienda = await Tienda.findOne({ ownerId: sender });
      if (!tienda) tienda = new Tienda({ ownerId: sender });
      
      tienda.abierta = true;
      await tienda.save();
      
      reply(fmt.aviso('Tienda abierta!'));
    } catch (err) {
      console.error('Error en !mitienda abrir:', err);
      reply(fmt.aviso('Error al procesar.'));
    }
  },

  'mitienda cerrar': async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      let tienda = await Tienda.findOne({ ownerId: sender });
      if (!tienda) tienda = new Tienda({ ownerId: sender });
      
      tienda.abierta = false;
      await tienda.save();
      
      reply(fmt.aviso('Tienda cerrada!'));
    } catch (err) {
      console.error('Error en !mitienda cerrar:', err);
      reply(fmt.aviso('Error al procesar.'));
    }
  },

  'mitienda diseño': async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      // Activar modo diseño
      modoDiseñoTienda.set(sender, true);
      reply(fmt.aviso('Envía tu diseño de tienda en el siguiente mensaje (respeta saltos de línea y formato)!'));
    } catch (err) {
      console.error('Error en !mitienda diseño:', err);
      reply(fmt.aviso('Error al procesar.'));
    }
  },

  'mitienda set-banner': async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      // Verificar que el mensaje tenga una imagen citada (Baileys quoted message)
      const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quotedMessage || (!quotedMessage.imageMessage && !quotedMessage.stickerMessage)) {
        return reply(fmt.aviso('Debes responder a una imagen para establecer el banner.'));
      }

      // Descargar media usando Baileys
      const mediaBuffer = await downloadMediaMessage(
        { message: quotedMessage }, // Objeto con la estructura esperada
        'buffer', 
        {}, 
        { logger: console }
      );
      
      // Subir a ImgBB (necesita API Key en .env como IMGBB_KEY)
      const imgbbKey = process.env.IMGBB_KEY;
      if (!imgbbKey) {
        return reply(fmt.aviso('Falta configurar IMGBB_KEY en el archivo .env.'));
      }

      // Usar FormData para enviar la imagen correctamente
      const FormData = require('form-data');
      const form = new FormData();
      form.append('image', mediaBuffer.toString('base64'));

      console.log("Subiendo banner a ImgBB...");
      
      const response = await axios.post(
        `https://api.imgbb.com/1/upload?key=${imgbbKey}`,
        form,
        { headers: form.getHeaders() }
      );

      if (response.data.success) {
        let tienda = await Tienda.findOne({ ownerId: sender });
        if (!tienda) tienda = new Tienda({ ownerId: sender });
        
        tienda.bannerUrl = response.data.data.url;
        await tienda.save();
        
        reply(fmt.aviso('Banner guardado!'));
      } else {
        console.error("❌ Error detallado de ImgBB:", response.data);
        reply(fmt.aviso('Error al subir la imagen a ImgBB.'));
      }
    } catch (err) {
      console.error('Error en !mitienda set-banner:', err.response?.data || err.message);
      reply(fmt.aviso('Error al procesar.'));
    }
  },

  'mitienda añadir': async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      if (args.length < 1) return reply(fmt.aviso('Uso: !mitienda añadir [Producto - Precio]'));
      
      const fullText = args.join(' ');
      
      // Extraer nombre y precio del nuevo producto
      const nuevoProductoMatch = fullText.match(/^(.+) - (\d+)$/);
      if (!nuevoProductoMatch) {
        return reply(fmt.aviso('Formato inválido. Usa: [Nombre Producto] - [Precio]'));
      }
      const [, nuevoNombre, nuevoPrecioStr] = nuevoProductoMatch;
      const nuevoPrecio = parseInt(nuevoPrecioStr);

      // Obtener la tienda
      let tienda = await Tienda.findOne({ ownerId: sender });
      if (!tienda) tienda = new Tienda({ ownerId: sender });

      // Analizar el diseñoLibre para encontrar el patrón decorativo
      const lineas = tienda.diseñoLibre.split('\n').filter(linea => linea.trim() !== '');
      
      // Buscar la última línea que tenga el formato "Texto - Número"
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

      // Generar la nueva línea
      const nuevaLinea = `${prefijo}${nuevoNombre} - ${nuevoPrecio}${sufijo}`;
      
      // Agregarla al diseñoLibre
      tienda.diseñoLibre = tienda.diseñoLibre 
        ? `${tienda.diseñoLibre}\n${nuevaLinea}` 
        : nuevaLinea;
      
      await tienda.save();
      
      reply(fmt.aviso('Producto añadido!'));
    } catch (err) {
      console.error('Error en !mitienda añadir:', err);
      reply(fmt.aviso('Error al procesar.'));
    }
  },

  // --- VISUALIZACIÓN Y COMPRA ---
  'ver-tienda': async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!mentionedJid) return reply(fmt.aviso('Uso: !ver-tienda @usuario'));

      const tienda = await Tienda.findOne({ ownerId: mentionedJid });
      if (!tienda || !tienda.aprobada) {
        return reply(fmt.aviso('Esta tienda no existe o no está aprobada.'));
      }

      const contenidoTienda = tienda.diseñoLibre || 'Tienda sin diseño.';

      if (tienda.bannerUrl) {
        // Enviar imagen con caption y menciones
        await sock.sendMessage(m.key.remoteJid, {
          image: { url: tienda.bannerUrl },
          caption: contenidoTienda,
          mentions: [mentionedJid]
        }, { quoted: m });
      } else {
        // Enviar solo texto con menciones
        await sock.sendMessage(m.key.remoteJid, {
          text: contenidoTienda,
          mentions: [mentionedJid]
        }, { quoted: m });
      }
    } catch (err) {
      console.error('Error en !ver-tienda:', err);
      reply(fmt.aviso('Error al procesar.'));
    }
  },

  comprar: async (sock, m, args, currentUser, config, reply, sender, groupId, userGroup) => {
    try {
      const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!mentionedJid || args.length < 2) return reply(fmt.aviso('Uso: !comprar @dueño [nombre producto]'));

      const tienda = await Tienda.findOne({ ownerId: mentionedJid });
      if (!tienda || !tienda.aprobada || !tienda.abierta) {
        return reply(fmt.aviso('Esta tienda no está disponible.'));
      }

      const nombreProducto = args.slice(1).join(' ');
      
      // Buscar producto en el diseñoLibre usando Regex
      const regexBusqueda = new RegExp(`(.+?)${nombreProducto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} - (\\d+)(.*)`, 'i');
      const match = tienda.diseñoLibre.match(regexBusqueda);
      
      if (!match) {
        return reply(fmt.aviso(`Producto "${nombreProducto}" no encontrado en la tienda.`));
      }

      const precio = parseInt(match[2]);

      // Verificar saldo del comprador
      let comprador = await User.findById(sender);
      if (!comprador) comprador = new User({ _id: sender });
      
      if (comprador.saldo < precio) {
        return reply(fmt.aviso('Saldo insuficiente.'));
      }

      // Enviar mensaje de confirmación y guardar transacción pendiente
      const mensajeConfirmacion = await sock.sendMessage(m.key.remoteJid, {
        text: `💰 @${mentionedJid.split('@')[0]}, el usuario @${sender.split('@')[0]} quiere comprar '${nombreProducto}' por ${precio} monedas. Responde a este mensaje con !aceptar para confirmar la venta o !rechazar para cancelarla.`,
        mentions: [mentionedJid, sender]
      }, { quoted: m });

      // Almacenar transacción pendiente
      transaccionesPendientes.set(mensajeConfirmacion.key.id, {
        compradorId: sender,
        vendedorId: mentionedJid,
        monto: precio,
        producto: nombreProducto,
        messageId: mensajeConfirmacion.key.id
      });
      
    } catch (err) {
      console.error('Error en !comprar:', err);
      reply(fmt.aviso('Error al procesar.'));
    }
  },

  // Exportamos las estructuras de memoria para index.js
  modoDiseñoTienda,
  transaccionesPendientes
};

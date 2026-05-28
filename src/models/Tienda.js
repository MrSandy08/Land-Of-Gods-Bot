const mongoose = require('mongoose');

const TiendaSchema = new mongoose.Schema({
  ownerId: { type: String, required: true }, // WhatsApp JID del dueño
  groupId: { type: String, required: true }, // WhatsApp JID del grupo donde existe esta tienda
  abierta: { type: Boolean, default: false },
  aprobada: { type: Boolean, default: false },
  diseñoLibre: { type: String, default: '' },
  imagenUrl: { type: String, default: '' }
}, { timestamps: true });

// Crear un índice compuesto único para evitar tiendas duplicadas del mismo usuario en el mismo grupo
TiendaSchema.index({ ownerId: 1, groupId: 1 }, { unique: true });

module.exports = mongoose.model('Tienda', TiendaSchema);

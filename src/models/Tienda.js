const mongoose = require('mongoose');

const TiendaSchema = new mongoose.Schema({
  ownerId: { type: String, required: true, unique: true }, // WhatsApp JID del dueño
  abierta: { type: Boolean, default: false },
  aprobada: { type: Boolean, default: false },
  diseñoLibre: { type: String, default: '' },
  bannerUrl: { type: String, default: null }
});

module.exports = mongoose.model('Tienda', TiendaSchema);

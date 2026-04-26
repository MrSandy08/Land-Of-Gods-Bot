const mongoose = require('mongoose');

const PedidoSchema = new mongoose.Schema({
  user: String,
  personaje: String,
  fandom: String,
  fecha: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Pedido', PedidoSchema);

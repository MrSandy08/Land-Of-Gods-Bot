const mongoose = require('mongoose');

const SugerenciaSchema = new mongoose.Schema({
  user: String,
  personaje: String, // Personaje de quien sugiere
  contenido: String,
  fecha: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Sugerencia', SugerenciaSchema);

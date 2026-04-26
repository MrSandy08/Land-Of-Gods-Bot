const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema({
  _id: { type: String, default: 'global' },
  antispam: {
    enabled: { type: Boolean, default: false },
    limit: { type: Number, default: 5 }, // mensajes
    seconds: { type: Number, default: 10 } // segundos
  },
  maxAdvertencias: { type: Number, default: 3 },
  minInactividad: { type: Number, default: 3 } // días
});

module.exports = mongoose.model('Config', ConfigSchema);

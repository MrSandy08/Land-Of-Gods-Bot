const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  _id: String, // WhatsApp ID (e.g. 123456789@s.whatsapp.net)
  personaje: { type: String, default: null },
  fandom: { type: String, default: null },
  mensajes: { type: Number, default: 0 },
  advertencias: [{
    razon: String,
    admin: String,
    fecha: { type: Date, default: Date.now }
  }],
  excusa: {
    fin: Date,
    razon: String,
    activa: { type: Boolean, default: false }
  },
  lastSeen: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);

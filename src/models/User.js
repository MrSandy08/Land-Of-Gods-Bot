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
  lastSeen: { type: Date, default: Date.now },
  
  // ────────────── SISTEMA DE ECONOMÍA ──────────────
  money: { type: Number, default: 0 },
  bank: { type: Number, default: 0 },
  cooldowns: {
    work: { type: Date, default: null },
    slut: { type: Date, default: null },
    daily: { type: Date, default: null },
    minar: { type: Date, default: null },
    pescar: { type: Date, default: null },
    atracar: { type: Date, default: null },
    cazar: { type: Date, default: null },
    extorsionar: { type: Date, default: null },
    suerte: { type: Date, default: null },
    crimen: { type: Date, default: null },
    robar: { type: Date, default: null },
    prostituirse: { type: Date, default: null }
  },
  isJailed: { type: Boolean, default: false },
  jailUntil: { type: Date, default: null },
  dailyStreak: { type: Number, default: 0 },
  lastDaily: { type: Date, default: null },
  
  // ────────────── SISTEMA DE ITS ──────────────
  its: { type: String, default: null }
});

module.exports = mongoose.model('User', UserSchema);

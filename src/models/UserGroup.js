const mongoose = require('mongoose');

const UserGroupSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // userId + '-' + groupId
  userId: { type: String, required: true },
  groupId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  
  // Personaje y Fandom
  personaje: { type: String, default: null },
  fandom: { type: String, default: null },
  
  // Mensajes
  mensajes: { type: Number, default: 0 },
  
  // Advertencias
  advertencias: [{
    razon: String,
    admin: String,
    fecha: { type: Date, default: Date.now }
  }],
  
  // Excusa
  excusa: {
    fin: Date,
    razon: String,
    activa: { type: Boolean, default: false }
  },
  
  // Última vez visto (en este grupo)
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
  its: { type: String, default: null },
  
  // ────────────── SISTEMA DE FIANZA INCREMENTAL ──────────────
  jailCount: { type: Number, default: 0 }
});

// Método para obtener o crear el UserGroup
UserGroupSchema.statics.getOrCreate = async function(userId, groupId) {
  const id = `${userId}-${groupId}`;
  let userGroup = await this.findById(id);
  
  if (!userGroup) {
    userGroup = new this({
      _id: id,
      userId,
      groupId
    });
    await userGroup.save();
  }
  
  return userGroup;
};

module.exports = mongoose.model('UserGroup', UserGroupSchema);

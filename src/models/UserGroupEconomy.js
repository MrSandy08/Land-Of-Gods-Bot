const mongoose = require('mongoose');

const UserGroupEconomySchema = new mongoose.Schema({
  _id: { type: String, required: true }, // userId + '-' + groupId
  userId: { type: String, required: true },
  groupId: { type: String, required: true },
  
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

// Método para obtener o crear la economía de un usuario en un grupo
UserGroupEconomySchema.statics.getOrCreate = async function(userId, groupId) {
  const id = `${userId}-${groupId}`;
  let economy = await this.findById(id);
  
  if (!economy) {
    economy = new this({
      _id: id,
      userId,
      groupId
    });
    await economy.save();
  }
  
  return economy;
};

module.exports = mongoose.model('UserGroupEconomy', UserGroupEconomySchema);

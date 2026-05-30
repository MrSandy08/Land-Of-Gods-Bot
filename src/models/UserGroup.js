const mongoose = require('mongoose');

const UserGroupSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // userId (global)
  userId: { type: String, required: true },
  groupId: { type: String, default: null }, // For standalone groups
  comunidadId: { type: String, default: null }, // For community groups
  createdAt: { type: Date, default: Date.now },
  fechaSalida: { type: Date, default: null },
  
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
  
  // Última vez visto
  lastSeen: { type: Date, default: Date.now }
});

// Método para obtener o crear el UserGroup (aislado por groupId)
UserGroupSchema.statics.getOrCreate = async function(userId, groupId) {
  if (!groupId) {
    throw new Error("Se requiere el groupId para obtener o crear un UserGroup aislado.");
  }

  // 1. Buscamos al usuario de forma única en ESTE grupo específico
  let member = await this.findOne({ userId, groupId });
  
  // 2. Si no existe, lo creamos vinculándolo estrictamente a este chat
  if (!member) {
    member = await this.create({
      _id: `${userId}_${groupId}`, // Usamos un ID compuesto para aislar por grupo
      userId,
      groupId,
      personaje: "Sin personaje",
      fandom: ""
    });
  }
  return member;
};

module.exports = mongoose.model('UserGroup', UserGroupSchema);

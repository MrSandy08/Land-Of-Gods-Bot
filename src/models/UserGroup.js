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

// Método para obtener o crear el UserGroup (inteligente por comunidad o groupId)
UserGroupSchema.statics.getOrCreate = async function(userId, groupId, comunidadId = null) {
  let member;
  
  if (comunidadId) {
    // 🏢 SI HAY COMUNIDAD: Buscamos por userId y comunidadId (compartido entre grupos)
    member = await this.findOne({ userId, comunidadId });
    if (!member) {
      member = await this.create({
        _id: `${userId}_${comunidadId}`, // ID compuesto por userId + comunidadId
        userId,
        comunidadId,
        groupId, // Guardamos el grupo de origen por referencia
        personaje: "Sin personaje",
        fandom: ""
      });
    }
  } else {
    // 🏠 SI NO HAY COMUNIDAD: Aislado estrictamente por groupId
    member = await this.findOne({ userId, groupId });
    if (!member) {
      member = await this.create({
        _id: `${userId}_${groupId}`, // ID compuesto por userId + groupId
        userId,
        groupId,
        personaje: "Sin personaje",
        fandom: ""
      });
    }
  }
  
  return member;
};

module.exports = mongoose.model('UserGroup', UserGroupSchema);

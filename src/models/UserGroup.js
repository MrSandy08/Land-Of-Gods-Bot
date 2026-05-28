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

// Método para obtener o crear el UserGroup (global, con groupId/comunidadId)
UserGroupSchema.statics.getOrCreate = async function(userId, groupId = null, comunidadId = null) {
  let userGroup = await this.findById(userId);
  
  if (!userGroup) {
    userGroup = new this({
      _id: userId,
      userId,
      groupId,
      comunidadId
    });
    await userGroup.save();
  } else {
    // Update groupId and comunidadId if needed
    if (groupId && userGroup.groupId !== groupId) {
      userGroup.groupId = groupId;
    }
    if (comunidadId && userGroup.comunidadId !== comunidadId) {
      userGroup.comunidadId = comunidadId;
    }
    if (userGroup.isModified()) {
      await userGroup.save();
    }
  }
  
  return userGroup;
};

module.exports = mongoose.model('UserGroup', UserGroupSchema);

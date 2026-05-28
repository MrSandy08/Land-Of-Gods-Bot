// src/models/Auth.js
const mongoose = require('mongoose');

const AuthSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Aquí guardaremos la clave (key) de Baileys
  value: { type: String, required: true } // El JSON stringificado de los datos
}, { timestamps: true });

module.exports = mongoose.model('Auth', AuthSchema);

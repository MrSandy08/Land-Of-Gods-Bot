const mongoose = require('mongoose');

const authCredsSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  creds: { type: mongoose.Schema.Types.Mixed, required: true },
  keys: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('AuthCreds', authCredsSchema);

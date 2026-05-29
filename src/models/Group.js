const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
  _id: String, // Group JID
  name: String,
  comunidadId: { type: String, default: null },
  economy: { type: Boolean, default: false }, // Economy toggle per group
  soloAdmins: { type: Boolean, default: false } // Modo solo admins
});

module.exports = mongoose.model('Group', GroupSchema);

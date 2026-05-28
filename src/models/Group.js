const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
  _id: String, // Group JID
  name: String,
  comunidadId: { type: String, default: null },
  economy: { type: Boolean, default: false } // Economy toggle per group
});

module.exports = mongoose.model('Group', GroupSchema);

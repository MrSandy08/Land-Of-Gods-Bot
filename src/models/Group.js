const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
  _id: String, // Group JID
  name: String
});

module.exports = mongoose.model('Group', GroupSchema);

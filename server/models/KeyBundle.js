// server/models/KeyBundle.js
const mongoose = require('mongoose');

const KeyBundleSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    unique: true,
    required: true
  },
  identityKey: {
    // Base64-строка или PEM-формат
    type: String,
    required: true
  },
  signedPreKey: {
    keyId:     { type: Number, required: true },
    publicKey: { type: String, required: true },
    signature: { type: String, required: true }
  },
  oneTimePreKeys: [
    {
      keyId:     { type: Number, required: true },
      publicKey: { type: String, required: true },
      used:      { type: Boolean, default: false }
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('KeyBundle', KeyBundleSchema);

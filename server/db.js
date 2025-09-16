// server/db.js
const mongoose = require('mongoose');
const config = require('config');

const mongoUri = process.env.MONGO_URI || config.get('db.mongoUri');

module.exports = async function connectDB() {
  try {
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
};

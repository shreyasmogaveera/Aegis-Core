const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('[MongoDB Error] MONGO_URI / MONGODB_URI environment variable is not defined.');
    return;
  }

  try {
    const conn = await mongoose.connect(mongoUri, {
      dbName: 'aegiscore'
    });
    console.log(`[MongoDB] Connected successfully to '${conn.connection.name}' database at host ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('[MongoDB Connection Error]:', error.message);
    throw error;
  }
};

module.exports = connectDB;

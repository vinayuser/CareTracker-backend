const mongoose = require('mongoose');

global.ObjectId = mongoose.Types.ObjectId;

const DEFAULT_URI = 'mongodb://127.0.0.1:27017/caretracker_backend';

function attachConnectionEvents() {
  const { connection } = mongoose;

  connection.on('connected', () => {
    console.log('MongoDB connected');
  });

  connection.on('disconnected', () => {
    console.warn('MongoDB disconnected — mongoose will retry automatically');
  });

  connection.on('error', (error) => {
    console.error('MongoDB connection error:', error.message);
  });

  connection.on('reconnected', () => {
    console.log('MongoDB reconnected');
  });
}

module.exports.mongodb = async () => {
  const uri = process.env.MONGODB_URI || DEFAULT_URI;

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  attachConnectionEvents();

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 20,
    minPoolSize: 2,
    heartbeatFrequencyMS: 10000,
  });

  console.log('MongoDB ready:', uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'));
  return mongoose.connection;
};

module.exports.isMongoReady = () => mongoose.connection.readyState === 1;

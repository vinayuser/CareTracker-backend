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
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/caretracker_backend';
  await mongoose.connect(uri);
  console.log('MongoDB connected:', uri);
};

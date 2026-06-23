const mongoose = require('mongoose');

global.ObjectId = mongoose.Types.ObjectId;

module.exports.mongodb = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/caretracker_backend';
  await mongoose.connect(uri);
  console.log('MongoDB connected:', uri);
};

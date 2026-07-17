const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Schema = mongoose.Schema;

const AdminModelSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      default: 'Admin',
    },
    email: {
      type: String,
      lowercase: true,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    jti: {
      type: String,
      default: '',
      index: true,
    },
    role: {
      type: String,
      enum: ['SUPER_ADMIN', 'ADMIN'],
      default: 'SUPER_ADMIN',
      required: true,
    },
    passwordResetToken: { type: String, default: '', index: true },
    passwordResetExpires: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

AdminModelSchema.methods.setPassword = function (password) {
  return new Promise((resolve, reject) => {
    if (!password) reject(new Error('Missing Password'));
    bcrypt.hash(password, 10, (err, hash) => {
      if (err) reject(err);
      this.password = hash;
      resolve(this);
    });
  });
};

AdminModelSchema.methods.authenticate = function (password) {
  return new Promise((resolve, reject) => {
    if (!password) reject(new Error('MISSING_PASSWORD'));
    bcrypt.compare(password, this.password, (error, result) => {
      if (!result) reject(new Error('Invalid Password'));
      resolve(this);
    });
  });
};

module.exports = mongoose.model('Admin', AdminModelSchema);

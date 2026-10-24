const mongoose = require('mongoose');

const DeviceTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agency',
      default: null,
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    pushToken: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ['android', 'ios'],
      required: true,
    },
  },
  { timestamps: true },
);

DeviceTokenSchema.index({ userId: 1, pushToken: 1 });

module.exports = mongoose.model('DeviceToken', DeviceTokenSchema);

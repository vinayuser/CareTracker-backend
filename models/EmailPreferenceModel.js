const mongoose = require('mongoose');

const EmailPreferenceSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    unsubscribed: { type: Boolean, default: false, index: true },
    topics: {
      type: [String],
      default: () => ['product', 'billing', 'hiring', 'updates'],
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('EmailPreference', EmailPreferenceSchema);

const mongoose = require('mongoose');

const EmailPreferenceSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    scope: { type: String, required: true, default: 'platform', index: true },
    unsubscribed: { type: Boolean, default: false, index: true },
    topics: {
      type: [String],
      default: () => ['product', 'billing', 'hiring', 'updates'],
    },
  },
  { timestamps: true },
);

EmailPreferenceSchema.index({ email: 1, scope: 1 }, { unique: true });

module.exports = mongoose.model('EmailPreference', EmailPreferenceSchema);

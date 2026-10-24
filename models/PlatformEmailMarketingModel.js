const mongoose = require('mongoose');

const PlatformEmailMarketingSchema = new mongoose.Schema(
  {
    scope: { type: String, default: 'platform', unique: true, index: true },
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    lists: { type: [mongoose.Schema.Types.Mixed], default: [] },
    tags: { type: [String], default: [] },
    segments: { type: [mongoose.Schema.Types.Mixed], default: [] },
    contacts: { type: [mongoose.Schema.Types.Mixed], default: [] },
    templates: { type: [mongoose.Schema.Types.Mixed], default: [] },
    campaigns: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true },
);

module.exports = mongoose.model('PlatformEmailMarketing', PlatformEmailMarketingSchema);

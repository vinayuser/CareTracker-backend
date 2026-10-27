const mongoose = require('mongoose');

const LegalPageSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      enum: ['privacy', 'terms'],
      index: true,
    },
    title: { type: String, required: true, trim: true },
    content: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model('LegalPage', LegalPageSchema);

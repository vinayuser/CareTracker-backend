const mongoose = require('mongoose');

const AgencyDocumentSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    name: { type: String, required: true },
    originalName: { type: String, default: '' },
    category: {
      type: String,
      enum: ['Legal', 'Insurance', 'Tax', 'Policy', 'Finance', 'HR', 'Other'],
      default: 'Other',
      index: true,
    },
    filePath: { type: String, required: true },
    mimeType: { type: String, default: 'application/pdf' },
    fileSize: { type: Number, default: 0 },
    expiryDate: { type: String, default: '' },
    status: {
      type: String,
      enum: ['Active', 'Expired', 'Archived'],
      default: 'Active',
      index: true,
    },
    isFavorite: { type: Boolean, default: false },
    uploadedById: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    uploadedByName: { type: String, default: '' },
  },
  { timestamps: true },
);

AgencyDocumentSchema.index({ agencyId: 1, createdAt: -1 });
AgencyDocumentSchema.index({ agencyId: 1, category: 1 });

module.exports = mongoose.model('AgencyDocument', AgencyDocumentSchema);

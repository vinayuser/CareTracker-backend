const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    path: { type: String, default: '' },
    fileName: { type: String, default: '' },
    mimeType: { type: String, default: 'application/pdf' },
    fileSize: { type: Number, default: 0 },
    isFillable: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Document', DocumentSchema);

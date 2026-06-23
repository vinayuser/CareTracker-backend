const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    clientCode: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, default: '', lowercase: true },
    phone: { type: String, default: '' },
    dateOfBirth: { type: String, default: '' },
    gender: { type: String, default: '' },
    streetAddress: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    zipCode: { type: String, default: '' },
    country: { type: String, default: 'United States' },
    primaryDiagnosis: { type: String, default: '' },
    allergies: { type: String, default: '' },
    mobility: { type: String, default: '' },
    livingArrangement: { type: String, default: '' },
    emergencyContactName: { type: String, default: '' },
    emergencyContactRelationship: { type: String, default: '' },
    emergencyContactPhone: { type: String, default: '' },
    profilePicPath: { type: String, default: '' },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);

ClientSchema.index({ agencyId: 1, clientCode: 1 }, { unique: true });
ClientSchema.index({ agencyId: 1, lastName: 1, firstName: 1 });

module.exports = mongoose.model('Client', ClientSchema);

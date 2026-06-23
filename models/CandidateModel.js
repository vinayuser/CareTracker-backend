const mongoose = require('mongoose');

const CandidateSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    phone: { type: String, default: '' },
    designation: { type: String, default: '' },
    location: { type: String, default: '' },
    country: { type: String, default: '' },
    education: { type: String, default: '' },
    experience: { type: Number, default: 0 },
    currentCtc: { type: Number, default: 0 },
    expectedCtc: { type: Number, default: 0 },
    dateOfBirth: { type: Date },
    summary: { type: String, default: '' },
    skills: { type: String, default: '' },
    sourceId: { type: String, default: '' },
    resumePath: { type: String, default: '' },
    profilePicPath: { type: String, default: '' },
    caregiverAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount' },
  },
  { timestamps: true },
);

CandidateSchema.index({ agencyId: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('Candidate', CandidateSchema);

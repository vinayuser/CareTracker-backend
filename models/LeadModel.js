const mongoose = require('mongoose');
const { LEAD_STAGES, LEAD_PRIORITIES } = require('../common/leadConstants');

const LeadSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    leadCode: { type: String, required: true },
    stage: { type: String, enum: LEAD_STAGES, default: 'New Lead', index: true },
    priority: { type: String, enum: LEAD_PRIORITIES, default: 'Medium', index: true },
    nextAction: { type: String, default: '' },
    notes: { type: String, default: '' },
    /** Denormalized for list/search */
    fullName: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '', lowercase: true },
    recipientName: { type: String, default: '' },
    leadSource: { type: String, default: '' },
    formData: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    assignedToAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount', default: null },
    assignedToName: { type: String, default: '' },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientAssessment', default: null },
    createdByAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount', default: null },
  },
  { timestamps: true },
);

LeadSchema.index({ agencyId: 1, leadCode: 1 }, { unique: true });
LeadSchema.index({ agencyId: 1, stage: 1, createdAt: -1 });

module.exports = mongoose.model('Lead', LeadSchema);

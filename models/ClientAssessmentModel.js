const mongoose = require('mongoose');
const { ASSESSMENT_STATUSES } = require('../common/assessmentConstants');

const ClientAssessmentSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    assessmentCode: { type: String, required: true },
    status: { type: String, enum: ASSESSMENT_STATUSES, default: 'Enquiry' },
    assessorName: { type: String, default: '' },
    assessorTitle: { type: String, default: 'Care Assessment Specialist' },
    assessorPhoto: { type: String, default: '' },
    assessmentDate: { type: String, default: '' },
    assessmentTypes: [{ type: String }],
    clientName: { type: String, default: '' },
    clientPhone: { type: String, default: '' },
    clientEmail: { type: String, default: '', lowercase: true },
    formData: { type: mongoose.Schema.Types.Mixed, default: {} },
    carePlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'CarePlan', default: null },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    createdByAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount' },
  },
  { timestamps: true },
);

ClientAssessmentSchema.index({ agencyId: 1, assessmentCode: 1 }, { unique: true });
ClientAssessmentSchema.index({ agencyId: 1, status: 1 });

module.exports = mongoose.model('ClientAssessment', ClientAssessmentSchema);

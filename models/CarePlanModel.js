const mongoose = require('mongoose');

const ServiceLineSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    category: { type: String, required: true },
    description: { type: String, default: '' },
    frequency: { type: String, default: 'Daily' },
    duration: { type: String, default: '30 mins' },
    provider: { type: String, default: 'Care Giver' },
    notes: { type: String, default: '' },
  },
  { _id: true },
);

const AssessmentSchema = new mongoose.Schema(
  {
    personalCare: { type: String, default: '' },
    mobility: { type: String, default: '' },
    medicationManagement: { type: String, default: '' },
    nutrition: { type: String, default: '' },
    cognitiveStatus: { type: String, default: '' },
    communication: { type: String, default: '' },
    emotionalWellbeing: { type: String, default: '' },
    homeSafety: { type: String, default: '' },
  },
  { _id: false },
);

const CarePlanSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', index: true },
    assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientAssessment', default: null },
    planCode: { type: String, required: true },
    status: {
      type: String,
      enum: ['Draft', 'Active', 'Archived'],
      default: 'Draft',
    },
    quoteStatus: {
      type: String,
      enum: ['Quoted', 'Accepted', 'Declined'],
      default: null,
    },
    hourlyRate: { type: Number, default: 0 },
    weeklyHours: { type: Number, default: 0 },
    quotedMonthlyPrice: { type: Number, default: 0 },
    agreementDate: { type: String, default: '' },
    effectiveDate: { type: String, default: '' },
    reviewDate: { type: String, default: '' },
    assessment: { type: AssessmentSchema, default: () => ({}) },
    assessmentNotes: { type: String, default: '' },
    services: { type: [ServiceLineSchema], default: [] },
    createdByAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount' },
  },
  { timestamps: true },
);

CarePlanSchema.index({ agencyId: 1, planCode: 1 }, { unique: true });
CarePlanSchema.index({ agencyId: 1, clientId: 1 });

module.exports = mongoose.model('CarePlan', CarePlanSchema);

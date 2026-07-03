const mongoose = require('mongoose');
const { INSURANCE_INTAKE_STATUSES } = require('../common/insuranceIntakeConstants');

const ClientInsuranceIntakeSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    intakeCode: { type: String, required: true },
    status: { type: String, enum: INSURANCE_INTAKE_STATUSES, default: 'Draft' },
    intakeDate: { type: String, default: '' },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    clientName: { type: String, default: '' },
    clientPhone: { type: String, default: '' },
    clientEmail: { type: String, default: '', lowercase: true },
    formData: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    createdByAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount' },
  },
  { timestamps: true },
);

ClientInsuranceIntakeSchema.index({ agencyId: 1, intakeCode: 1 }, { unique: true });
ClientInsuranceIntakeSchema.index({ agencyId: 1, clientId: 1 });

module.exports = mongoose.model('ClientInsuranceIntake', ClientInsuranceIntakeSchema);

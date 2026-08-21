const mongoose = require('mongoose');
const { HOLIDAY_TYPES, HOLIDAY_STATUSES } = require('../common/leaveConstants');

const HolidaySchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    name: { type: String, required: true, trim: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    type: { type: String, enum: HOLIDAY_TYPES, default: 'National' },
    status: { type: String, enum: HOLIDAY_STATUSES, default: 'Active', index: true },
    blocksWork: { type: Boolean, default: true },
    applicableTo: { type: String, default: 'All Caregivers' },
    notes: { type: String, default: '' },
    createdByAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount', default: null },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true },
);

HolidaySchema.index({ agencyId: 1, date: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Holiday', HolidaySchema);

const mongoose = require('mongoose');

const LimitsSchema = new mongoose.Schema(
  {
    maxClients: { type: Number, default: null },
    maxCaregivers: { type: Number, default: null },
    maxUsers: { type: Number, default: null },
    maxBranches: { type: Number, default: null },
  },
  { _id: false },
);

const DurationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['ongoing', 'dueDate', 'limited'], default: 'ongoing' },
    dueDate: { type: String, default: null },
    value: { type: Number, default: null },
    unit: { type: String, default: 'months' },
  },
  { _id: false },
);

const AssignedAgencySchema = new mongoose.Schema(
  {
    id: String,
    name: String,
  },
  { _id: false },
);

const SubscriptionPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    iconColor: { type: String, default: 'bg-blue-100 text-blue-600' },
    price: { type: Number, required: true },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
    status: {
      type: String,
      enum: ['Active', 'Scheduled', 'Inactive', 'Expired'],
      default: 'Active',
    },
    startDate: { type: String, default: '' },
    endDate: { type: String, default: '' },
    limits: { type: LimitsSchema, default: () => ({}) },
    duration: { type: DurationSchema, default: () => ({}) },
    selectedFeatures: [{ type: String }],
    customFeatures: [{ type: String }],
    features: [{ type: String }],
    assignedAgencies: [AssignedAgencySchema],
    isActive: { type: Boolean, default: true },
    createdAt: { type: String, default: () => new Date().toISOString().split('T')[0] },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('SubscriptionPlan', SubscriptionPlanSchema);

const mongoose = require('mongoose');

const UsageSchema = new mongoose.Schema(
  {
    clients: { type: Number, default: 0 },
    caregivers: { type: Number, default: 0 },
    users: { type: Number, default: 0 },
    branches: { type: Number, default: 0 },
  },
  { _id: false },
);

const PaymentMethodSchema = new mongoose.Schema(
  {
    brand: { type: String, default: '' },
    last4: { type: String, default: '' },
    expMonth: { type: String, default: '' },
    expYear: { type: String, default: '' },
    nameOnCard: { type: String, default: '' },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true },
);

const AgencySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    legalName: { type: String, default: '' },
    email: { type: String, required: true },
    phone: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    ownerName: { type: String, default: '' },
    agencyType: { type: String, default: '' },
    yearEstablished: { type: String, default: '' },
    website: { type: String, default: '' },
    address: { type: String, default: '' },
    fax: { type: String, default: '' },
    serviceAreas: [{ type: String }],
    description: { type: String, default: '' },
    status: {
      type: String,
      enum: ['Active', 'Pending', 'Inactive', 'Suspended'],
      default: 'Pending',
    },
    subscriptionPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
    usage: { type: UsageSchema, default: () => ({}) },
    autoRenewal: { type: Boolean, default: true },
    taxRate: { type: Number, default: 0 },
    addOnAmount: { type: Number, default: 0 },
    paymentMethods: { type: [PaymentMethodSchema], default: [] },
    registeredAt: { type: String, default: () => new Date().toISOString().split('T')[0] },
    iconColor: { type: String, default: 'bg-blue-100 text-blue-600' },
    logoPath: { type: String, default: '' },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('Agency', AgencySchema);

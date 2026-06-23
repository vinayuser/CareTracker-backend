const mongoose = require('mongoose');

const InvitationSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    agencyName: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    message: { type: String, default: '' },
    subscriptionPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
    planName: { type: String, default: '' },
    planPrice: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['Pending', 'Accepted', 'Expired'],
      default: 'Pending',
    },
    invitedOn: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('Invitation', InvitationSchema);

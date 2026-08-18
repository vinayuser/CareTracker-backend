const mongoose = require('mongoose');

const AgencySubscriptionInvoiceSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    invoiceCode: { type: String, required: true },
    invoiceDate: { type: Date, required: true },
    dueDate: { type: Date, default: null },
    planName: { type: String, default: '' },
    billingCycle: { type: String, default: 'monthly' },
    planAmount: { type: Number, default: 0 },
    addOnAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['Paid', 'Pending', 'Overdue', 'Failed'],
      default: 'Pending',
      index: true,
    },
    paidAt: { type: Date, default: null },
    paymentMethodLabel: { type: String, default: '' },
    transactionId: { type: String, default: '' },
  },
  { timestamps: true },
);

AgencySubscriptionInvoiceSchema.index({ agencyId: 1, invoiceCode: 1 }, { unique: true });
AgencySubscriptionInvoiceSchema.index({ agencyId: 1, invoiceDate: -1 });

module.exports = mongoose.model('AgencySubscriptionInvoice', AgencySubscriptionInvoiceSchema);

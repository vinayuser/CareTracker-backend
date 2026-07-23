const mongoose = require('mongoose');

const InvoiceLineSchema = new mongoose.Schema(
  {
    visitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', required: true },
    visitCode: { type: String, default: '' },
    serviceArea: { type: String, default: '' },
    careNeedAreaKey: { type: String, default: '' },
    date: { type: String, default: '' },
    caregiverName: { type: String, default: '' },
    timezone: { type: String, default: '' },
    checkInAt: { type: Date, default: null },
    checkOutAt: { type: Date, default: null },
    scheduledStartAt: { type: Date, default: null },
    scheduledEndAt: { type: Date, default: null },
    billableMinutes: { type: Number, default: 0 },
    billableHours: { type: Number, default: 0 },
    hourlyRate: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
  },
  { _id: false },
);

const ClientInvoiceSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    invoiceCode: { type: String, required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    clientName: { type: String, default: '' },
    clientEmail: { type: String, default: '' },
    clientPhone: { type: String, default: '' },
    clientAddress: { type: String, default: '' },
    clientCode: { type: String, default: '' },
    agencyName: { type: String, default: '' },
    agencyPhone: { type: String, default: '' },
    agencyEmail: { type: String, default: '' },
    agencyAddress: { type: String, default: '' },
    periodFrom: { type: String, required: true },
    periodTo: { type: String, required: true },
    status: {
      type: String,
      enum: ['Draft', 'Sent', 'Paid', 'Void'],
      default: 'Draft',
      index: true,
    },
    lines: { type: [InvoiceLineSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    sentAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    pdfPath: { type: String, default: '' },
    createdByAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount', default: null },
  },
  { timestamps: true },
);

ClientInvoiceSchema.index({ agencyId: 1, invoiceCode: 1 }, { unique: true });
ClientInvoiceSchema.index({ agencyId: 1, clientId: 1, periodFrom: 1, periodTo: 1 });

module.exports = mongoose.model('ClientInvoice', ClientInvoiceSchema);

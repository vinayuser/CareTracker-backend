const mongoose = require('mongoose');

const DemoEnquirySchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    country: { type: String, default: 'US', trim: true },
    dialCode: { type: String, default: '+1', trim: true },
    phone: { type: String, required: true, trim: true },
    scheduleDate: { type: String, required: true, trim: true },
    scheduleTime: { type: String, required: true, trim: true },
    timezone: { type: String, default: '', trim: true },
    address: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['New', 'Reviewed', 'Closed'],
      default: 'New',
      index: true,
    },
    source: { type: String, default: 'website', trim: true },
  },
  { timestamps: true },
);

DemoEnquirySchema.index({ createdAt: -1 });
DemoEnquirySchema.index({ firstName: 1, lastName: 1, email: 1 });

module.exports = mongoose.model('DemoEnquiry', DemoEnquirySchema);

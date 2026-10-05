const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    recipientType: {
      type: String,
      enum: ['admin', 'agency_account'],
      required: true,
      index: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agency',
      default: null,
      index: true,
    },
    type: { type: String, required: true, index: true },
    category: {
      type: String,
      enum: ['billing', 'compliance', 'hiring', 'clinical', 'schedule', 'system', 'message'],
      default: 'system',
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
    },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    tone: {
      type: String,
      enum: ['info', 'success', 'warning', 'danger'],
      default: 'info',
    },
    actionUrl: { type: String, default: '' },
    actionLabel: { type: String, default: 'View' },
    entityType: { type: String, default: '' },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

NotificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });
NotificationSchema.index({ agencyId: 1, type: 1, entityId: 1 });

module.exports = mongoose.model('Notification', NotificationSchema);

const Model = require('../../models/index');
const functions = require('../../common/functions');
const constants = require('../../common/constants');
const MailService = require('./mail.service');
const NotificationService = require('./notification.service');

const DIALS = {
  US: '+1',
  CA: '+1',
  GB: '+44',
  IN: '+91',
  AU: '+61',
};

const formatUsPhone = (value = '') => {
  const digits = String(value).replace(/\D/g, '').slice(0, 10);
  if (digits.length !== 10) return String(value || '').trim();
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const todayKey = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const formatEnquiry = (doc) => {
  const row = functions.toClientDoc(doc);
  if (!row) return null;
  row.fullName = `${row.firstName || ''} ${row.lastName || ''}`.trim();
  row.createdAt = doc.createdAt?.toISOString?.() || doc.createdAt;
  return row;
};

const create = async (req, payload) => {
  const firstName = String(payload.firstName || '').trim();
  const lastName = String(payload.lastName || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const phone = formatUsPhone(payload.phone);
  const scheduleDate = String(payload.scheduleDate || '').trim();
  const scheduleTime = String(payload.scheduleTime || '').trim();
  const address = String(payload.address || '').trim();
  const country = String(payload.country || 'US').trim().toUpperCase() || 'US';

  if (scheduleDate < todayKey()) {
    throw new Error('Schedule date must be today or later');
  }

  const enquiry = await Model.DemoEnquiryModel.create({
    firstName,
    lastName,
    email,
    country,
    dialCode: payload.dialCode || DIALS[country] || '+1',
    phone,
    scheduleDate,
    scheduleTime,
    timezone: String(payload.timezone || '').trim(),
    address,
    status: 'New',
    source: 'website',
  });

  const formatted = formatEnquiry(enquiry);

  NotificationService.emit(async () => {
    await MailService.sendDemoEnquiryEmail(formatted);
    await NotificationService.notifyPlatformAdmins({
      type: NotificationService.TYPES.DEMO_ENQUIRY_RECEIVED,
      category: 'system',
      title: 'New demo request',
      body: `${formatted.fullName} requested a demo for ${formatted.scheduleDate} at ${formatted.scheduleTime}.`,
      tone: 'info',
      actionUrl: '/admin/enquiries',
      actionLabel: 'View enquiry',
      entityType: 'DemoEnquiry',
      entityId: enquiry._id,
      metadata: {
        email: formatted.email,
        phone: formatted.phone,
        scheduleDate: formatted.scheduleDate,
        scheduleTime: formatted.scheduleTime,
      },
    });
  });

  return { id: formatted.id };
};

const list = async (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
  const search = String(query.search || '').trim();
  const status = String(query.status || '').trim();
  const filter = {};

  if (status && status !== 'All') {
    filter.status = status;
  }

  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { firstName: regex },
      { lastName: regex },
      { email: regex },
      { phone: regex },
      { address: regex },
    ];
  }

  const [total, rows] = await Promise.all([
    Model.DemoEnquiryModel.countDocuments(filter),
    Model.DemoEnquiryModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    list: rows.map((row) => formatEnquiry(row)),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      from: total === 0 ? 0 : (page - 1) * limit + 1,
      to: Math.min(page * limit, total),
    },
  };
};

const getById = async (id) => {
  const doc = await Model.DemoEnquiryModel.findById(id).lean();
  if (!doc) throw new Error(constants.MESSAGE.DEMO_ENQUIRY.NOT_FOUND);
  return formatEnquiry(doc);
};

module.exports = {
  create,
  list,
  getById,
};

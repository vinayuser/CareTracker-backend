const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const { sendCandidateCustomEmail } = require('../common/mail.service');

const getAgencyAccount = (req) => req.agency_owner || req.hr;
const getAgencyId = (req) => {
  const account = getAgencyAccount(req);
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return agencyId;
};

const formatClientAddress = (client) => {
  if (!client) return '';
  return [client.streetAddress, client.aptSuite, client.city, client.state, client.zipCode]
    .filter(Boolean)
    .join(', ');
};

const formatAgencyAddress = (agency) => {
  if (!agency) return '';
  return agency.address || '';
};

const generateInvoiceCode = async (agencyId) => {
  const count = await Model.ClientInvoiceModel.countDocuments({ agencyId });
  return `INV-${String(10001 + count).padStart(5, '0')}`;
};

const buildLineFromVisit = (visit) => {
  const minutes = visit.billableMinutes
    || Math.max(1, Math.round(((visit.billableSeconds || visit.elapsedSeconds || 0) / 60)));
  const rate = visit.hourlyRateSnapshot || 25;
  const hours = Number((minutes / 60).toFixed(2));
  const amount = Number((hours * rate).toFixed(2));
  return {
    visitId: visit._id,
    visitCode: visit.visitCode || '',
    serviceArea: visit.serviceArea || '',
    careNeedAreaKey: visit.careNeedAreaKey || '',
    date: visit.scheduledDate || '',
    caregiverName: visit.caregiverName || '',
    timezone: visit.timezone || '',
    checkInAt: visit.checkInAt || null,
    checkOutAt: visit.checkOutAt || null,
    scheduledStartAt: visit.scheduledStartAt || null,
    scheduledEndAt: visit.scheduledEndAt || null,
    billableMinutes: minutes,
    billableHours: hours,
    hourlyRate: rate,
    amount,
  };
};

const formatInvoice = (doc) => {
  const item = functions.toClientDoc(doc);
  if (!item) return null;
  item.agencyId = String(doc.agencyId);
  item.clientId = String(doc.clientId);
  item.createdByAccountId = doc.createdByAccountId ? String(doc.createdByAccountId) : null;
  item.lines = (doc.lines || []).map((line) => {
    const raw = line.toObject?.() || line;
    return {
      ...raw,
      visitId: String(raw.visitId),
      checkInAt: raw.checkInAt || null,
      checkOutAt: raw.checkOutAt || null,
      scheduledStartAt: raw.scheduledStartAt || null,
      scheduledEndAt: raw.scheduledEndAt || null,
    };
  });
  return item;
};

/** Backfill visit times on older invoices that only stored date/service. */
const enrichInvoiceLines = async (invoice) => {
  const lines = invoice.lines || [];
  const missing = lines.filter((l) => !l.checkInAt || !l.checkOutAt);
  if (!missing.length) return invoice;

  const visitIds = missing.map((l) => l.visitId).filter(Boolean);
  if (!visitIds.length) return invoice;

  const visits = await Model.VisitModel.find({ _id: { $in: visitIds } });
  const byId = {};
  visits.forEach((v) => { byId[String(v._id)] = v; });

  let changed = false;
  invoice.lines = lines.map((line) => {
    const raw = line.toObject?.() || { ...line };
    const visit = byId[String(raw.visitId)];
    if (!visit) return raw;
    if (!raw.checkInAt && visit.checkInAt) {
      raw.checkInAt = visit.checkInAt;
      changed = true;
    }
    if (!raw.checkOutAt && visit.checkOutAt) {
      raw.checkOutAt = visit.checkOutAt;
      changed = true;
    }
    if (!raw.scheduledStartAt && visit.scheduledStartAt) {
      raw.scheduledStartAt = visit.scheduledStartAt;
      changed = true;
    }
    if (!raw.scheduledEndAt && visit.scheduledEndAt) {
      raw.scheduledEndAt = visit.scheduledEndAt;
      changed = true;
    }
    if (!raw.timezone && visit.timezone) {
      raw.timezone = visit.timezone;
      changed = true;
    }
    if (!raw.caregiverName && visit.caregiverName) {
      raw.caregiverName = visit.caregiverName;
      changed = true;
    }
    if (!raw.visitCode && visit.visitCode) {
      raw.visitCode = visit.visitCode;
      changed = true;
    }
    return raw;
  });

  if (changed && typeof invoice.markModified === 'function') {
    invoice.markModified('lines');
    await invoice.save();
  }
  return invoice;
};

const getAll = async (req, query = {}) => {
  const agencyId = getAgencyId(req);
  const filter = { agencyId };
  if (query.client_id) filter.clientId = query.client_id;
  if (query.status) filter.status = query.status;
  const list = await Model.ClientInvoiceModel.find(filter).sort({ createdAt: -1 });
  return list.map(formatInvoice);
};

const getById = async (req, id) => {
  const agencyId = getAgencyId(req);
  let doc = await Model.ClientInvoiceModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.INVOICE.NOT_FOUND);
  doc = await enrichInvoiceLines(doc);
  return formatInvoice(doc);
};

const generateDraft = async (req, payload) => {
  const agencyId = getAgencyId(req);
  const account = getAgencyAccount(req);
  const client = await Model.ClientModel.findOne({ _id: payload.client_id, agencyId });
  if (!client) throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);

  const agency = await Model.AgencyModel.findById(agencyId);
  const periodFrom = payload.period_from;
  const periodTo = payload.period_to;

  const visits = await Model.VisitModel.find({
    agencyId,
    clientId: client._id,
    approvalStatus: 'Approved',
    invoiced: { $ne: true },
    scheduledDate: { $gte: periodFrom, $lte: periodTo },
    checkOutAt: { $ne: null },
  }).sort({ scheduledDate: 1, scheduledStartAt: 1 });

  if (!visits.length) throw new Error(constants.MESSAGE.INVOICE.NO_VISITS);

  const lines = visits.map(buildLineFromVisit);
  const subtotal = Number(lines.reduce((sum, line) => sum + line.amount, 0).toFixed(2));

  const invoice = await Model.ClientInvoiceModel.create({
    agencyId,
    invoiceCode: await generateInvoiceCode(agencyId),
    clientId: client._id,
    clientName: `${client.firstName || ''} ${client.lastName || ''}`.trim(),
    clientEmail: client.email || '',
    clientPhone: client.phone || client.phoneHome || '',
    clientAddress: formatClientAddress(client),
    clientCode: client.clientCode || '',
    agencyName: agency?.name || '',
    agencyPhone: agency?.phone || '',
    agencyEmail: agency?.email || '',
    agencyAddress: formatAgencyAddress(agency),
    periodFrom,
    periodTo,
    status: 'Draft',
    lines,
    subtotal,
    total: subtotal,
    notes: payload.notes || '',
    createdByAccountId: account?._id || account?.id || null,
  });

  await Model.VisitModel.updateMany(
    { _id: { $in: visits.map((v) => v._id) } },
    { $set: { invoiced: true, invoiceId: invoice._id } },
  );

  return formatInvoice(invoice);
};

const formatClock = (iso, timeZone) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const opts = { hour: 'numeric', minute: '2-digit' };
  if (timeZone) opts.timeZone = timeZone;
  try {
    return d.toLocaleTimeString('en-US', opts);
  } catch {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
};

const sendInvoice = async (req, id) => {
  const agencyId = getAgencyId(req);
  let invoice = await Model.ClientInvoiceModel.findOne({ _id: id, agencyId });
  if (!invoice) throw new Error(constants.MESSAGE.INVOICE.NOT_FOUND);
  if (!invoice.clientEmail) throw new Error('Client email not found');
  invoice = await enrichInvoiceLines(invoice);

  const agency = await Model.AgencyModel.findById(agencyId).select('name');
  const sender = getAgencyAccount(req);
  const linesText = (invoice.lines || [])
    .map((l) => {
      const inT = formatClock(l.checkInAt, l.timezone);
      const outT = formatClock(l.checkOutAt, l.timezone);
      return [
        `${l.date} · ${l.serviceArea || 'Service'}`,
        l.caregiverName ? `Caregiver: ${l.caregiverName}` : null,
        `Time: ${inT} – ${outT}`,
        `${l.billableHours}h @ $${Number(l.hourlyRate).toFixed(2)}/hr = $${Number(l.amount).toFixed(2)}`,
      ].filter(Boolean).join('\n  ');
    })
    .join('\n\n');

  await sendCandidateCustomEmail({
    to: invoice.clientEmail,
    candidateName: invoice.clientName || 'Client',
    agencyName: agency?.name || invoice.agencyName,
    subject: `Invoice ${invoice.invoiceCode} from ${agency?.name || invoice.agencyName || 'CareTraker'}`,
    message: [
      `Please find your invoice ${invoice.invoiceCode} for ${invoice.periodFrom} to ${invoice.periodTo}.`,
      '',
      'Visit details:',
      linesText,
      '',
      `Subtotal: $${Number(invoice.subtotal || invoice.total).toFixed(2)}`,
      `Total due: $${Number(invoice.total).toFixed(2)}`,
      invoice.notes ? `\nNotes: ${invoice.notes}` : '',
    ].filter(Boolean).join('\n'),
    senderName: sender?.fullName || sender?.name || '',
  });

  invoice.status = 'Sent';
  invoice.sentAt = new Date();
  await invoice.save();
  return formatInvoice(invoice);
};

const markPaid = async (req, id) => {
  const agencyId = getAgencyId(req);
  const invoice = await Model.ClientInvoiceModel.findOne({ _id: id, agencyId });
  if (!invoice) throw new Error(constants.MESSAGE.INVOICE.NOT_FOUND);
  invoice.status = 'Paid';
  invoice.paidAt = new Date();
  await invoice.save();
  return formatInvoice(invoice);
};

const voidInvoice = async (req, id) => {
  const agencyId = getAgencyId(req);
  const invoice = await Model.ClientInvoiceModel.findOne({ _id: id, agencyId });
  if (!invoice) throw new Error(constants.MESSAGE.INVOICE.NOT_FOUND);

  const visitIds = (invoice.lines || []).map((l) => l.visitId).filter(Boolean);
  if (visitIds.length) {
    await Model.VisitModel.updateMany(
      { _id: { $in: visitIds }, invoiceId: invoice._id },
      { $set: { invoiced: false, invoiceId: null } },
    );
  }

  invoice.status = 'Void';
  await invoice.save();
  return formatInvoice(invoice);
};

module.exports = {
  getAll,
  getById,
  generateDraft,
  sendInvoice,
  markPaid,
  voidInvoice,
};

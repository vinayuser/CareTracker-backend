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

const generateInvoiceCode = async (agencyId) => {
  const count = await Model.ClientInvoiceModel.countDocuments({ agencyId });
  return `INV-${String(10001 + count).padStart(5, '0')}`;
};

const formatInvoice = (doc) => {
  const item = functions.toClientDoc(doc);
  if (!item) return null;
  item.agencyId = String(doc.agencyId);
  item.clientId = String(doc.clientId);
  item.createdByAccountId = doc.createdByAccountId ? String(doc.createdByAccountId) : null;
  item.lines = (doc.lines || []).map((line) => ({
    ...line.toObject?.() || line,
    visitId: String(line.visitId),
  }));
  return item;
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
  const doc = await Model.ClientInvoiceModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.INVOICE.NOT_FOUND);
  return formatInvoice(doc);
};

const generateDraft = async (req, payload) => {
  const agencyId = getAgencyId(req);
  const account = getAgencyAccount(req);
  const client = await Model.ClientModel.findOne({ _id: payload.client_id, agencyId });
  if (!client) throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);

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

  const lines = visits.map((visit) => {
    const minutes = visit.billableMinutes
      || Math.max(1, Math.round(((visit.billableSeconds || visit.elapsedSeconds || 0) / 60)));
    const rate = visit.hourlyRateSnapshot || 25;
    const hours = Number((minutes / 60).toFixed(2));
    const amount = Number((hours * rate).toFixed(2));
    return {
      visitId: visit._id,
      visitCode: visit.visitCode,
      serviceArea: visit.serviceArea || '',
      date: visit.scheduledDate,
      caregiverName: visit.caregiverName || '',
      billableMinutes: minutes,
      billableHours: hours,
      hourlyRate: rate,
      amount,
    };
  });

  const subtotal = Number(lines.reduce((sum, line) => sum + line.amount, 0).toFixed(2));

  const invoice = await Model.ClientInvoiceModel.create({
    agencyId,
    invoiceCode: await generateInvoiceCode(agencyId),
    clientId: client._id,
    clientName: `${client.firstName || ''} ${client.lastName || ''}`.trim(),
    clientEmail: client.email || '',
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

const sendInvoice = async (req, id) => {
  const agencyId = getAgencyId(req);
  const invoice = await Model.ClientInvoiceModel.findOne({ _id: id, agencyId });
  if (!invoice) throw new Error(constants.MESSAGE.INVOICE.NOT_FOUND);
  if (!invoice.clientEmail) throw new Error('Client email not found');

  const agency = await Model.AgencyModel.findById(agencyId).select('name');
  const sender = getAgencyAccount(req);
  const linesText = (invoice.lines || [])
    .map((l) => `${l.date} · ${l.serviceArea || 'Service'} · ${l.billableHours}h @ $${l.hourlyRate} = $${l.amount}`)
    .join('\n');

  await sendCandidateCustomEmail({
    to: invoice.clientEmail,
    candidateName: invoice.clientName || 'Client',
    agencyName: agency?.name,
    subject: `Invoice ${invoice.invoiceCode} from ${agency?.name || 'CareTraker'}`,
    message: [
      `Please find your invoice ${invoice.invoiceCode} for ${invoice.periodFrom} to ${invoice.periodTo}.`,
      '',
      linesText,
      '',
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

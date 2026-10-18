const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const { sendCandidateCustomEmail } = require('../common/mail.service');
const NotificationService = require('../common/notification.service');

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
  const latest = await Model.ClientInvoiceModel.findOne({ agencyId })
    .sort({ invoiceCode: -1 })
    .select('invoiceCode')
    .lean();
  const current = Number(String(latest?.invoiceCode || '').replace(/\D/g, '')) || 10000;
  return `INV-${String(current + 1).padStart(5, '0')}`;
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
  if (!item.dueDate && doc.periodTo) {
    const due = new Date(`${doc.periodTo}T12:00:00`);
    if (!Number.isNaN(due.getTime())) {
      due.setDate(due.getDate() + 30);
      item.dueDate = due;
    }
  }
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
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 5));
  const filter = { agencyId };
  if (query.client_id) filter.clientId = query.client_id;
  if (query.status && query.status !== 'All') filter.status = query.status;

  const [total, list] = await Promise.all([
    Model.ClientInvoiceModel.countDocuments(filter),
    Model.ClientInvoiceModel.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      {
        $project: {
          invoiceCode: 1,
          clientId: 1,
          clientName: 1,
          clientEmail: 1,
          periodFrom: 1,
          periodTo: 1,
          dueDate: 1,
          status: 1,
          total: 1,
          subtotal: 1,
          createdAt: 1,
          updatedAt: 1,
          lineCount: { $size: { $ifNull: ['$lines', []] } },
        },
      },
    ]),
  ]);

  const openInvoices = await Model.ClientInvoiceModel.find({
    agencyId,
    status: { $in: ['Draft', 'Sent'] },
  }).select('dueDate periodTo').lean();
  let nextDueDate = null;
  openInvoices.forEach((doc) => {
    let due = doc.dueDate ? new Date(doc.dueDate) : null;
    if ((!due || Number.isNaN(due.getTime())) && doc.periodTo) {
      due = new Date(`${doc.periodTo}T12:00:00`);
      if (!Number.isNaN(due.getTime())) due.setDate(due.getDate() + 30);
    }
    if (!due || Number.isNaN(due.getTime())) return;
    if (!nextDueDate || due < nextDueDate) nextDueDate = due;
  });

  return {
    nextDueDate,
    list: list.map((doc) => ({
      id: String(doc._id),
      invoiceCode: doc.invoiceCode || '',
      clientId: doc.clientId ? String(doc.clientId) : '',
      clientName: doc.clientName || '',
      clientEmail: doc.clientEmail || '',
      periodFrom: doc.periodFrom || '',
      periodTo: doc.periodTo || '',
      dueDate: doc.dueDate || (() => {
        if (!doc.periodTo) return null;
        const due = new Date(`${doc.periodTo}T12:00:00`);
        if (Number.isNaN(due.getTime())) return null;
        due.setDate(due.getDate() + 30);
        return due;
      })(),
      status: doc.status || 'Draft',
      total: doc.total || 0,
      subtotal: doc.subtotal || 0,
      lineCount: doc.lineCount || 0,
      createdAt: doc.createdAt || null,
      updatedAt: doc.updatedAt || null,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
      from: total === 0 ? 0 : (page - 1) * limit + 1,
      to: Math.min(page * limit, total),
    },
  };
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

  const voidInvoiceIds = await Model.ClientInvoiceModel.find({
    agencyId,
    clientId: client._id,
    status: 'Void',
  }).distinct('_id');

  const visits = await Model.VisitModel.find({
    agencyId,
    clientId: client._id,
    approvalStatus: 'Approved',
    scheduledDate: { $gte: periodFrom, $lte: periodTo },
    checkOutAt: { $ne: null },
    $or: [
      { invoiced: { $ne: true } },
      { invoiceId: { $in: voidInvoiceIds } },
      { invoiceId: null },
    ],
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
    dueDate: (() => {
      const due = new Date(`${periodTo}T12:00:00`);
      if (Number.isNaN(due.getTime())) return null;
      due.setDate(due.getDate() + 30);
      return due;
    })(),
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

const pdfEscape = (value) => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)')
  .replace(/[^\x20-\x7E]/g, ' ');

/** Minimal multi-page PDF so the invoice can be attached without a PDF library. */
const buildPlainPdf = (lines) => {
  const pageSize = 42;
  const pages = [];
  for (let i = 0; i < lines.length; i += pageSize) pages.push(lines.slice(i, i + pageSize));
  if (!pages.length) pages.push(['Invoice']);

  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };

  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = pages.map((pageLines) => {
    const stream = pageLines.map((line, index) => (
      `BT /F1 11 Tf 48 ${760 - index * 16} Td (${pdfEscape(line).slice(0, 95)}) Tj ET`
    )).join('\n');
    const contentId = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    return add(`<< /Type /Page /Parent PAGES /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`);
  });
  const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const withParent = objects.map((body) => body.replace('Parent PAGES', `Parent ${pagesId} 0 R`));

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  withParent.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${withParent.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${withParent.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
};

const buildInvoicePdf = (invoice) => {
  const money = (value) => `$${Number(value || 0).toFixed(2)}`;
  const due = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-US') : '—';
  const lines = [
    'CareTraker',
    'INVOICE',
    '',
    `Invoice #: ${invoice.invoiceCode || ''}`,
    `Status: ${invoice.status || ''}`,
    `Period: ${invoice.periodFrom || ''} - ${invoice.periodTo || ''}`,
    `Due date: ${due}`,
    '',
    `From: ${invoice.agencyName || ''}`,
    invoice.agencyAddress || '',
    invoice.agencyEmail || '',
    invoice.agencyPhone || '',
    '',
    `Bill to: ${invoice.clientName || ''}`,
    invoice.clientAddress || '',
    invoice.clientEmail || '',
    '',
    'Date        Service                  Hours    Amount',
  ];
  (invoice.lines || []).forEach((line) => {
    lines.push(
      `${String(line.date || '').slice(0, 10).padEnd(12)}${String(line.serviceArea || 'Service').slice(0, 22).padEnd(24)}${Number(line.billableHours || 0).toFixed(2).padStart(6)}  ${money(line.amount)}`,
    );
    if (line.caregiverName) lines.push(`            ${line.caregiverName}`);
  });
  lines.push('');
  lines.push(`Total due: ${money(invoice.total)}`);
  if (invoice.notes) lines.push(`Notes: ${invoice.notes}`);
  return buildPlainPdf(lines.filter((line) => line !== undefined));
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
      'The invoice PDF is attached to this email.',
      '',
      'Visit details:',
      linesText,
      '',
      `Subtotal: $${Number(invoice.subtotal || invoice.total).toFixed(2)}`,
      `Total due: $${Number(invoice.total).toFixed(2)}`,
      invoice.notes ? `\nNotes: ${invoice.notes}` : '',
    ].filter(Boolean).join('\n'),
    senderName: sender?.fullName || sender?.name || '',
    attachments: [{
      filename: `${invoice.invoiceCode || 'invoice'}.pdf`,
      content: buildInvoicePdf(invoice),
      contentType: 'application/pdf',
    }],
  });

  invoice.status = 'Sent';
  invoice.sentAt = new Date();
  await invoice.save();

  NotificationService.emit(async () => {
    await NotificationService.notifyAgency(agencyId, {
      type: NotificationService.TYPES.INVOICE_SENT,
      category: 'billing',
      title: 'Invoice sent',
      body: `Invoice ${invoice.invoiceCode} sent to ${invoice.clientName || invoice.clientEmail}.`,
      tone: 'success',
      actionUrl: '/agency/billing',
      entityType: 'ClientInvoice',
      entityId: invoice._id,
      metadata: { invoiceCode: invoice.invoiceCode, total: invoice.total },
    }, { moduleKey: 'AGENCY_BILLING' });

    const clientAccount = invoice.clientId
      ? await Model.AgencyAccountModel.findOne({ agencyId, clientId: invoice.clientId, role: 'CLIENT' }).select('_id')
      : null;
    if (clientAccount) {
      await NotificationService.notifyAccount(clientAccount._id, {
        type: NotificationService.TYPES.INVOICE_RECEIVED,
        category: 'billing',
        title: 'New invoice available',
        body: `Invoice ${invoice.invoiceCode} for $${Number(invoice.total).toFixed(2)} is ready to view.`,
        tone: 'info',
        actionUrl: '/client/invoices',
        entityType: 'ClientInvoice',
        entityId: invoice._id,
        metadata: { invoiceCode: invoice.invoiceCode, total: invoice.total },
      });
    }
  });

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
      { _id: { $in: visitIds } },
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

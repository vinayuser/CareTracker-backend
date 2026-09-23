const mongoose = require('mongoose');
const Model = require('../../models/index');
const functions = require('../../common/functions');
const constants = require('../../common/constants');
const { notArchivedFilter } = require('../../common/agencyVisibility');

const toOid = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) return new mongoose.Types.ObjectId(String(value));
  return null;
};

const parseDateKey = (value) => {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
};

const startOfDay = (dateKey) => {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const endOfDay = (dateKey) => {
  const d = new Date(`${dateKey}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatLongDate = (value) => {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const displayStatus = (status) => (status === 'Paid' ? 'Paid' : 'Unpaid');

const jobNameFromLine = (line = {}) => {
  const area = String(line.serviceArea || '').trim();
  if (area) return area;
  const key = String(line.careNeedAreaKey || '').trim();
  if (!key) return '—';
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const agencyScope = async (agencyId) => {
  const oid = toOid(agencyId);
  if (oid) {
    const visible = await Model.AgencyModel.findOne({ _id: oid, ...notArchivedFilter() }).select('_id name');
    if (!visible) return { filter: { agencyId: { $in: [] } }, agencyMap: {} };
    return {
      filter: { agencyId: oid },
      agencyMap: { [String(visible._id)]: visible.name || '' },
    };
  }
  const agencies = await Model.AgencyModel.find(notArchivedFilter()).select('_id name').lean();
  const agencyMap = {};
  agencies.forEach((a) => {
    agencyMap[String(a._id)] = a.name || '';
  });
  return {
    filter: { agencyId: { $in: agencies.map((a) => a._id) } },
    agencyMap,
  };
};

const buildDateFilter = (fromKey, toKey) => {
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  if (!from && !to) return {};
  const createdAt = {};
  if (from) {
    const start = startOfDay(from);
    if (start) createdAt.$gte = start;
  }
  if (to) {
    const end = endOfDay(to);
    if (end) createdAt.$lte = end;
  }
  return Object.keys(createdAt).length ? { createdAt } : {};
};

const buildMatch = async (query = {}) => {
  const { filter: agencyFilter, agencyMap } = await agencyScope(query.agencyId);
  const dateFilter = buildDateFilter(query.from || query.dateFrom, query.to || query.dateTo);
  const match = {
    ...agencyFilter,
    ...dateFilter,
    status: { $ne: 'Void' },
  };

  const search = String(query.search || '').trim();
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    match.$or = [
      { invoiceCode: regex },
      { clientName: regex },
      { 'lines.caregiverName': regex },
      { 'lines.serviceArea': regex },
      { 'lines.careNeedAreaKey': regex },
    ];
  }

  return { match, agencyMap, search };
};

const getStats = async (query = {}) => {
  const { match } = await buildMatch(query);

  const [totals] = await Model.ClientInvoiceModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalInvoices: { $sum: 1 },
        totalInvoiceAmount: { $sum: { $ifNull: ['$total', 0] } },
        paidInvoices: {
          $sum: { $cond: [{ $eq: ['$status', 'Paid'] }, 1, 0] },
        },
        paidAmount: {
          $sum: { $cond: [{ $eq: ['$status', 'Paid'] }, { $ifNull: ['$total', 0] }, 0] },
        },
        unpaidInvoices: {
          $sum: { $cond: [{ $ne: ['$status', 'Paid'] }, 1, 0] },
        },
        unpaidAmount: {
          $sum: { $cond: [{ $ne: ['$status', 'Paid'] }, { $ifNull: ['$total', 0] }, 0] },
        },
      },
    },
  ]);

  return {
    totalInvoices: totals?.totalInvoices || 0,
    totalInvoiceAmount: Number((totals?.totalInvoiceAmount || 0).toFixed(2)),
    paidInvoices: totals?.paidInvoices || 0,
    paidAmount: Number((totals?.paidAmount || 0).toFixed(2)),
    unpaidInvoices: totals?.unpaidInvoices || 0,
    unpaidAmount: Number((totals?.unpaidAmount || 0).toFixed(2)),
  };
};

const lineMatchesSearch = (line, invoice, search) => {
  if (!search) return true;
  const q = search.toLowerCase();
  const hay = [
    invoice.invoiceCode,
    invoice.clientName,
    line.caregiverName,
    line.serviceArea,
    line.careNeedAreaKey,
    jobNameFromLine(line),
  ]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
  return hay.includes(q);
};

const flattenInvoiceLines = (invoices, agencyMap, search) => {
  const rows = [];
  invoices.forEach((doc) => {
    const agencyId = String(doc.agencyId);
    const agencyName = doc.agencyName || agencyMap[agencyId] || '—';
    const status = displayStatus(doc.status);
    const totalInvoiceAmount = Number(doc.total || 0);
    const lines = Array.isArray(doc.lines) && doc.lines.length
      ? doc.lines
      : [{ caregiverName: '', serviceArea: '', billableHours: 0, hourlyRate: 0, amount: 0 }];

    lines.forEach((line, index) => {
      if (!lineMatchesSearch(line, doc, search)) return;
      const hours = Number(line.billableHours || 0);
      const rate = Number(line.hourlyRate || 0);
      const amount = Number(line.amount || 0);
      rows.push({
        id: `${doc._id}-${index}`,
        invoiceId: String(doc._id),
        agencyId,
        agencyName,
        invoiceDate: doc.createdAt || null,
        invoiceDateLabel: formatLongDate(doc.createdAt),
        invoiceCode: doc.invoiceCode || '',
        caregiverName: String(line.caregiverName || '').trim() || '—',
        jobName: jobNameFromLine(line),
        billingRate: rate,
        hoursSpent: hours,
        billingAmount: amount,
        totalInvoiceAmount,
        status,
        rawStatus: doc.status || 'Draft',
      });
    });
  });
  return rows;
};

const summarizeGroup = (agencyId, agencyName, rows) => {
  const invoiceIds = new Set(rows.map((r) => r.invoiceId));
  const invoiceAmounts = {};
  rows.forEach((r) => {
    if (invoiceAmounts[r.invoiceId] == null) invoiceAmounts[r.invoiceId] = r.totalInvoiceAmount;
  });
  const totalInvoiceAmount = Object.values(invoiceAmounts).reduce((s, n) => s + Number(n || 0), 0);
  const totalHours = rows.reduce((s, r) => s + Number(r.hoursSpent || 0), 0);
  const totalBillingAmount = rows.reduce((s, r) => s + Number(r.billingAmount || 0), 0);
  const statuses = new Set(rows.map((r) => r.status));
  let statusSummary = 'Unpaid';
  if (statuses.size === 1 && statuses.has('Paid')) statusSummary = 'Paid';
  else if (statuses.has('Paid') && statuses.has('Unpaid')) statusSummary = 'Mixed';

  return {
    agencyId,
    agencyName,
    invoiceCount: invoiceIds.size,
    lineCount: rows.length,
    totalHours: Number(totalHours.toFixed(2)),
    totalBillingAmount: Number(totalBillingAmount.toFixed(2)),
    totalInvoiceAmount: Number(totalInvoiceAmount.toFixed(2)),
    statusSummary,
  };
};

const getGroupedLines = async (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 5));
  const { match, agencyMap, search } = await buildMatch(query);

  const invoices = await Model.ClientInvoiceModel.find(match)
    .sort({ createdAt: -1 })
    .select('agencyId agencyName invoiceCode clientName total status lines createdAt')
    .lean();

  const allRows = flattenInvoiceLines(invoices, agencyMap, search);

  const byAgency = new Map();
  allRows.forEach((row) => {
    if (!byAgency.has(row.agencyId)) byAgency.set(row.agencyId, []);
    byAgency.get(row.agencyId).push(row);
  });

  const groups = Array.from(byAgency.entries())
    .map(([agencyId, rows]) => summarizeGroup(agencyId, rows[0]?.agencyName || agencyMap[agencyId] || '—', rows))
    .sort((a, b) => a.agencyName.localeCompare(b.agencyName));

  let expandedAgencyId = String(query.expandedAgencyId || query.agencyId || '').trim();
  if (expandedAgencyId && !byAgency.has(expandedAgencyId)) {
    expandedAgencyId = groups[0]?.agencyId || '';
  }
  if (!expandedAgencyId) {
    expandedAgencyId = groups[0]?.agencyId || '';
  }

  const expandedRows = expandedAgencyId ? (byAgency.get(expandedAgencyId) || []) : [];
  const total = expandedRows.length;
  const start = (page - 1) * limit;
  const lines = expandedRows.slice(start, start + limit);
  const expandedGroup = groups.find((g) => g.agencyId === expandedAgencyId) || null;

  return {
    groups,
    expandedAgencyId: expandedAgencyId || null,
    lines,
    agencyTotals: expandedGroup
      ? {
        hoursSpent: expandedGroup.totalHours,
        billingAmount: expandedGroup.totalBillingAmount,
        totalInvoiceAmount: expandedGroup.totalInvoiceAmount,
      }
      : { hoursSpent: 0, billingAmount: 0, totalInvoiceAmount: 0 },
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
      from: total === 0 ? 0 : start + 1,
      to: Math.min(start + limit, total),
      agencyName: expandedGroup?.agencyName || '',
      invoiceCount: expandedGroup?.invoiceCount || 0,
    },
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
      visitId: raw.visitId ? String(raw.visitId) : null,
    };
  });
  item.displayStatus = displayStatus(doc.status);
  return item;
};

const getInvoiceById = async (id) => {
  const oid = toOid(id);
  if (!oid) throw new Error(constants.MESSAGE.INVOICE.NOT_FOUND);

  const doc = await Model.ClientInvoiceModel.findById(oid);
  if (!doc) throw new Error(constants.MESSAGE.INVOICE.NOT_FOUND);

  const agency = await Model.AgencyModel.findOne({ _id: doc.agencyId, ...notArchivedFilter() }).select('_id');
  if (!agency) throw new Error(constants.MESSAGE.INVOICE.NOT_FOUND);

  return formatInvoice(doc);
};

module.exports = {
  getStats,
  getGroupedLines,
  getInvoiceById,
};

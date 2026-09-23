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
  const ids = agencies.map((a) => a._id);
  const agencyMap = {};
  agencies.forEach((a) => {
    agencyMap[String(a._id)] = a.name || '';
  });
  return { filter: { agencyId: { $in: ids } }, agencyMap };
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

const displayStatus = (status) => (status === 'Paid' ? 'Paid' : 'Unpaid');

const summarizeLines = (lines = []) => {
  const names = [];
  const rates = [];
  (lines || []).forEach((line) => {
    const name = String(line.caregiverName || '').trim();
    if (name && !names.includes(name)) names.push(name);
    const rate = Number(line.hourlyRate);
    if (Number.isFinite(rate) && rate > 0) rates.push(rate);
  });
  const billingRate = rates.length
    ? Number((rates.reduce((s, r) => s + r, 0) / rates.length).toFixed(2))
    : 0;
  return {
    caregiverName: names.length ? names.join(', ') : '—',
    billingRate,
  };
};

const getStats = async (query = {}) => {
  const { filter: agencyFilter } = await agencyScope(query.agencyId);
  const dateFilter = buildDateFilter(query.from || query.dateFrom, query.to || query.dateTo);
  const match = {
    ...agencyFilter,
    ...dateFilter,
    status: { $ne: 'Void' },
  };

  const [totals] = await Model.ClientInvoiceModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalInvoices: { $sum: 1 },
        totalBilledAmount: { $sum: { $ifNull: ['$total', 0] } },
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
    totalBilledAmount: Number((totals?.totalBilledAmount || 0).toFixed(2)),
    paidInvoices: totals?.paidInvoices || 0,
    paidAmount: Number((totals?.paidAmount || 0).toFixed(2)),
    unpaidInvoices: totals?.unpaidInvoices || 0,
    unpaidAmount: Number((totals?.unpaidAmount || 0).toFixed(2)),
  };
};

const getInvoices = async (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
  const { filter: agencyFilter, agencyMap } = await agencyScope(query.agencyId);
  const dateFilter = buildDateFilter(query.from || query.dateFrom, query.to || query.dateTo);
  const match = {
    ...agencyFilter,
    ...dateFilter,
    status: { $ne: 'Void' },
  };

  const [total, list] = await Promise.all([
    Model.ClientInvoiceModel.countDocuments(match),
    Model.ClientInvoiceModel.find(match)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('agencyId agencyName invoiceCode clientName total status lines createdAt periodFrom periodTo')
      .lean(),
  ]);

  const rows = list.map((doc) => {
    const lineSummary = summarizeLines(doc.lines);
    const agencyId = String(doc.agencyId);
    return {
      id: String(doc._id),
      agencyId,
      agencyName: doc.agencyName || agencyMap[agencyId] || '—',
      invoiceCode: doc.invoiceCode || '',
      clientName: doc.clientName || '',
      caregiverName: lineSummary.caregiverName,
      billingRate: lineSummary.billingRate,
      billingAmount: Number(doc.total || 0),
      status: displayStatus(doc.status),
      rawStatus: doc.status || 'Draft',
      invoiceDate: doc.createdAt || null,
      invoiceDateLabel: formatLongDate(doc.createdAt),
      periodFrom: doc.periodFrom || '',
      periodTo: doc.periodTo || '',
    };
  });

  return {
    list: rows,
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
  if (!oid) throw new Error(constants.MESSAGE.INVOICE?.NOT_FOUND || 'Invoice not found');

  const doc = await Model.ClientInvoiceModel.findById(oid);
  if (!doc) throw new Error(constants.MESSAGE.INVOICE?.NOT_FOUND || 'Invoice not found');

  const agency = await Model.AgencyModel.findOne({ _id: doc.agencyId, ...notArchivedFilter() }).select('_id');
  if (!agency) throw new Error(constants.MESSAGE.INVOICE?.NOT_FOUND || 'Invoice not found');

  return formatInvoice(doc);
};

module.exports = {
  getStats,
  getInvoices,
  getInvoiceById,
};

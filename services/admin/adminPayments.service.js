const Model = require('../../models/index');
const functions = require('../../common/functions');

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

const formatPaymentInvoice = (doc, agencyMap = {}) => {
  const client = functions.toClientDoc(doc);
  const agencyId = client.agencyId ? String(client.agencyId) : '';
  const agency = agencyMap[agencyId] || {};
  return {
    id: client.id,
    agencyId,
    agencyName: agency.name || '',
    agencyEmail: agency.email || '',
    agencyPhone: agency.phone || '',
    agencyAddress: agency.address || '',
    agencyCity: agency.city || '',
    agencyState: agency.state || '',
    invoiceCode: client.invoiceCode,
    invoiceDate: client.invoiceDate,
    dueDate: client.dueDate,
    planName: client.planName || '',
    billingCycle: client.billingCycle || '',
    planAmount: money(client.planAmount),
    addOnAmount: money(client.addOnAmount),
    taxAmount: money(client.taxAmount),
    taxRate: Number(client.taxRate || 0),
    total: money(client.total),
    status: client.status || 'Pending',
    paidAt: client.paidAt || null,
    paymentMethodLabel: client.paymentMethodLabel || '',
    transactionId: client.transactionId || '',
  };
};

const buildAgencyMap = async (agencyIds) => {
  const ids = [...new Set(agencyIds.filter(Boolean).map(String))];
  if (!ids.length) return {};
  const agencies = await Model.AgencyModel.find({ _id: { $in: ids } })
    .select('name email phone address city state')
    .lean();
  return agencies.reduce((acc, agency) => {
    acc[String(agency._id)] = agency;
    return acc;
  }, {});
};

const getStats = async (query = {}) => {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.agencyId) filter.agencyId = query.agencyId;

  const [paid, pending, overdue, failed, totals] = await Promise.all([
    Model.AgencySubscriptionInvoiceModel.countDocuments({ ...filter, status: 'Paid' }),
    Model.AgencySubscriptionInvoiceModel.countDocuments({ ...filter, status: 'Pending' }),
    Model.AgencySubscriptionInvoiceModel.countDocuments({ ...filter, status: 'Overdue' }),
    Model.AgencySubscriptionInvoiceModel.countDocuments({ ...filter, status: 'Failed' }),
    Model.AgencySubscriptionInvoiceModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          amount: { $sum: '$total' },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const byStatus = totals.reduce((acc, row) => {
    acc[row._id] = { amount: money(row.amount), count: row.count };
    return acc;
  }, {});

  return {
    paidCount: paid,
    pendingCount: pending,
    overdueCount: overdue,
    failedCount: failed,
    paidAmount: byStatus.Paid?.amount || 0,
    pendingAmount: money((byStatus.Pending?.amount || 0) + (byStatus.Overdue?.amount || 0)),
    totalCount: paid + pending + overdue + failed,
  };
};

const listPayments = async (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.agencyId) filter.agencyId = query.agencyId;
  if (query.search) {
    const term = String(query.search).trim();
    if (term) {
      filter.$or = [
        { invoiceCode: new RegExp(term, 'i') },
        { planName: new RegExp(term, 'i') },
        { transactionId: new RegExp(term, 'i') },
      ];
    }
  }
  if (query.from || query.to) {
    filter.invoiceDate = {};
    if (query.from) filter.invoiceDate.$gte = new Date(`${query.from}T00:00:00.000Z`);
    if (query.to) filter.invoiceDate.$lte = new Date(`${query.to}T23:59:59.999Z`);
  }

  const [docs, total] = await Promise.all([
    Model.AgencySubscriptionInvoiceModel.find(filter)
      .sort({ invoiceDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Model.AgencySubscriptionInvoiceModel.countDocuments(filter),
  ]);

  const agencyMap = await buildAgencyMap(docs.map((d) => d.agencyId));
  const items = docs.map((doc) => formatPaymentInvoice(doc, agencyMap));

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
};

const getPaymentById = async (id) => {
  const doc = await Model.AgencySubscriptionInvoiceModel.findById(id).lean();
  if (!doc) throw new Error('Invoice not found');
  const agencyMap = await buildAgencyMap([doc.agencyId]);
  return formatPaymentInvoice(doc, agencyMap);
};

module.exports = {
  getStats,
  listPayments,
  getPaymentById,
  formatPaymentInvoice,
};

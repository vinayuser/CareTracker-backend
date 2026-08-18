const Model = require('../../models/index');
const functions = require('../../common/functions');
const { buildUploadUrl } = require('../../common/candidateHelpers');
const fs = require('fs/promises');
const path = require('path');

const formatPlan = (plan) => {
  if (!plan) return null;
  const client = functions.toClientDoc(plan);
  if (client && plan.subscriptionPlanId) {
    client.subscriptionPlanId = String(plan.subscriptionPlanId);
  }
  if (client && client.subscriptionPlanId && typeof client.subscriptionPlanId === 'object') {
    client.subscriptionPlanId = String(client.subscriptionPlanId);
  }
  return client;
};

const formatAgency = (agency) => {
  const client = functions.toClientDoc(agency);
  if (client?.subscriptionPlanId) {
    client.subscriptionPlanId = String(client.subscriptionPlanId);
  }
  return client;
};

const toIsoDate = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    const raw = String(value);
    return raw.length >= 10 ? raw.slice(0, 10) : null;
  }
  return d.toISOString().slice(0, 10);
};

const parseSkills = (skills) => {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills.map((s) => String(s).trim()).filter(Boolean);
  return String(skills)
    .split(/[,|;/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
};

const caregiverCode = (account) => {
  if (account.employeeId) return String(account.employeeId);
  const digits = String(account._id).replace(/\D/g, '').slice(-5).padStart(5, '0');
  return `CG-${digits}`;
};

const buildTimeline = (agency, plan) => {
  const events = [];
  const registered = toIsoDate(agency.registeredAt || agency.createdAt);
  if (registered) {
    events.push({
      id: 'registered',
      title: 'Agency Registered',
      detail: `${agency.name || 'Agency'} joined the platform`,
      date: registered,
      tone: 'done',
    });
  }

  if (plan?.name) {
    const cycle = plan.billingCycle ? ` · ${plan.billingCycle}` : '';
    events.push({
      id: 'plan',
      title: 'Current Plan',
      detail: `${plan.name}${cycle}`,
      date: registered || toIsoDate(agency.updatedAt),
      tone: 'done',
    });
  }

  return events.filter((e) => e.date);
};

const getLiveUsage = async (agencyId, agency) => {
  const [clients, caregivers, employees] = await Promise.all([
    Model.ClientModel.countDocuments({ agencyId }),
    Model.AgencyAccountModel.countDocuments({ agencyId, role: 'CAREGIVER' }),
    Model.AgencyAccountModel.countDocuments({
      agencyId,
      role: { $in: ['AGENCY_OWNER', 'HR', 'CAREGIVER'] },
    }),
  ]);

  const serviceAreaCount = Array.isArray(agency.serviceAreas) ? agency.serviceAreas.length : 0;

  return {
    clients,
    caregivers,
    users: employees,
    branches: serviceAreaCount || agency.usage?.branches || 0,
  };
};

const getTopCaregivers = async (agencyId) => {
  const rows = await Model.AgencyAccountModel.find({ agencyId, role: 'CAREGIVER' })
    .select('fullName email phone status createdAt employeeId')
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  return rows.map((row) => ({
    id: String(row._id),
    code: caregiverCode(row),
    name: row.fullName || '',
    email: row.email || '',
    phone: row.phone || '',
    status: row.status || 'Active',
    joinedOn: toIsoDate(row.createdAt),
  }));
};

const monthBounds = (offset = 0) => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1));
  return { start, end };
};

const getCaregiverStats = async (agencyId) => {
  const base = { agencyId, role: 'CAREGIVER' };
  const thisMonth = monthBounds(0);
  const lastMonth = monthBounds(-1);

  const [total, active, inactive, pending, newThisMonth, newLastMonth] = await Promise.all([
    Model.AgencyAccountModel.countDocuments(base),
    Model.AgencyAccountModel.countDocuments({ ...base, status: 'Active' }),
    Model.AgencyAccountModel.countDocuments({ ...base, status: 'Inactive' }),
    Model.AgencyAccountModel.countDocuments({ ...base, status: 'Pending' }),
    Model.AgencyAccountModel.countDocuments({
      ...base,
      createdAt: { $gte: thisMonth.start, $lt: thisMonth.end },
    }),
    Model.AgencyAccountModel.countDocuments({
      ...base,
      createdAt: { $gte: lastMonth.start, $lt: lastMonth.end },
    }),
  ]);

  let trendPct = null;
  if (newLastMonth > 0) {
    trendPct = Number((((newThisMonth - newLastMonth) / newLastMonth) * 100).toFixed(1));
  } else if (newThisMonth > 0) {
    trendPct = 100;
  } else {
    trendPct = 0;
  }

  return {
    total,
    active,
    inactive,
    pending,
    onLeave: pending,
    newThisMonth,
    newLastMonth,
    trendPct,
  };
};

const formatAdminCaregiver = (account, candidateMap) => {
  const candidate = account.candidateId
    ? candidateMap.get(String(account.candidateId))
    : null;
  const skills = parseSkills(candidate?.skills);
  const profilePic = account.profilePicPath
    ? buildUploadUrl(account.profilePicPath)
    : (candidate?.profilePicPath ? buildUploadUrl(candidate.profilePicPath) : '');

  return {
    id: String(account._id),
    code: caregiverCode(account),
    name: account.fullName || '',
    email: account.email || '',
    phone: account.phone || candidate?.phone || '',
    status: account.status || 'Active',
    joinedOn: toIsoDate(account.createdAt),
    skills,
    experience: candidate?.experience || '',
    profilePic,
    employeeId: account.employeeId || '',
  };
};

const getCaregivers = async (agencyId, query = {}) => {
  const agency = await Model.AgencyModel.findById(agencyId).select('_id');
  if (!agency) throw new Error('Agency Not Found');

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
  const search = String(query.search || '').trim();
  const status = String(query.status || 'All');

  const filter = { agencyId: agency._id, role: 'CAREGIVER' };
  if (status && status !== 'All') {
    filter.status = status;
  }
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { fullName: regex },
      { email: regex },
      { phone: regex },
      { employeeId: regex },
      { userId: regex },
    ];
  }

  const [stats, total, rows] = await Promise.all([
    getCaregiverStats(agency._id),
    Model.AgencyAccountModel.countDocuments(filter),
    Model.AgencyAccountModel.find(filter)
      .select('fullName email phone status createdAt employeeId candidateId profilePicPath')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const candidateIds = rows.map((r) => r.candidateId).filter(Boolean);
  const candidates = candidateIds.length
    ? await Model.CandidateModel.find({ _id: { $in: candidateIds } })
      .select('skills experience phone profilePicPath')
      .lean()
    : [];
  const candidateMap = new Map(candidates.map((c) => [String(c._id), c]));

  const list = rows.map((row) => formatAdminCaregiver(row, candidateMap));
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    stats,
    list,
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

const getAll = async () => {
  const agencies = await Model.AgencyModel.find().sort({ createdAt: -1 });
  return functions.toClientList(agencies).map(formatAgency);
};

/** Lightweight dropdown list — id + name (+ status for badges). */
const getOptions = async () => {
  const agencies = await Model.AgencyModel.find()
    .select('name status')
    .sort({ name: 1 })
    .lean();
  return agencies.map((agency) => ({
    id: String(agency._id),
    name: agency.name || '',
    status: agency.status || 'Active',
  }));
};

const getById = async (id) => {
  const agency = await Model.AgencyModel.findById(id);
  if (!agency) throw new Error('Agency Not Found');

  const agencyOid = agency._id;
  const [usage, caregivers, planDoc] = await Promise.all([
    getLiveUsage(agencyOid, agency),
    getTopCaregivers(agencyOid),
    agency.subscriptionPlanId
      ? Model.SubscriptionPlanModel.findById(agency.subscriptionPlanId)
      : Promise.resolve(null),
  ]);

  const plan = formatPlan(planDoc);
  const formatted = formatAgency(agency);
  formatted.usage = usage;
  formatted.caregivers = caregivers;
  formatted.caregiverTotal = usage.caregivers;
  formatted.plan = plan;
  formatted.timeline = buildTimeline(agency, plan);
  return formatted;
};

const addBillingCycle = (date, billingCycle = 'monthly') => {
  const next = new Date(date);
  if (billingCycle === 'yearly') next.setUTCFullYear(next.getUTCFullYear() + 1);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
};

const parseDateValue = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const getNextRenewalDate = (startDate, billingCycle = 'monthly', lastPaidAt = null) => {
  const origin = parseDateValue(lastPaidAt) || parseDateValue(startDate);
  if (!origin) return null;
  let next = addBillingCycle(origin, billingCycle);
  const now = new Date();
  let guard = 0;
  while (next <= now && guard < 120) {
    next = addBillingCycle(next, billingCycle);
    guard += 1;
  }
  return next;
};

const daysUntilDate = (date) => {
  const target = parseDateValue(date);
  if (!target) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(target);
  end.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86400000));
};

const paymentMethodLabel = (method) => {
  if (!method?.last4) return '';
  const brand = method.brand || 'Card';
  return `${brand} ending in ${method.last4}`;
};

const formatPaymentMethod = (method) => {
  if (!method) return null;
  const obj = typeof method.toObject === 'function' ? method.toObject() : { ...method };
  return {
    id: obj._id ? String(obj._id) : obj.id || null,
    brand: obj.brand || '',
    last4: obj.last4 || '',
    expMonth: obj.expMonth || '',
    expYear: obj.expYear || '',
    nameOnCard: obj.nameOnCard || '',
    isDefault: Boolean(obj.isDefault),
    label: paymentMethodLabel(obj),
  };
};

const generateInvoiceCode = async (agencyId) => {
  const count = await Model.AgencySubscriptionInvoiceModel.countDocuments({ agencyId });
  const digits = String(agencyId).replace(/\D/g, '').slice(-4).padStart(4, '0');
  return `INV-${digits}-${String(count + 1).padStart(4, '0')}`;
};

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));

const uploadsRoot = path.join(__dirname, '../../uploads');

const resolveUploadPath = (stored) => {
  if (!stored) return null;
  let clean = String(stored).replace(/^\/+/, '');
  if (clean.startsWith('uploads/')) clean = clean.slice('uploads/'.length);
  if (clean.startsWith('api/uploads/')) clean = clean.slice('api/uploads/'.length);
  return path.join(uploadsRoot, clean);
};

const getStorageUsage = async (agencyId) => {
  const rows = await Model.CandidateFormSubmissionModel.find({
    agencyId,
    filledPdfPath: { $nin: [null, ''] },
  }).select('filledPdfPath').lean();

  const sizes = await Promise.all(rows.map(async (row) => {
    const full = resolveUploadPath(row.filledPdfPath);
    if (!full) return 0;
    try {
      const st = await fs.stat(full);
      return st.isFile() ? st.size : 0;
    } catch {
      return 0;
    }
  }));

  return sizes.reduce((sum, size) => sum + size, 0);
};

const formatInvoice = (invoice) => {
  const client = functions.toClientDoc(invoice);
  return {
    id: client.id,
    invoiceCode: client.invoiceCode,
    invoiceDate: client.invoiceDate,
    dueDate: client.dueDate,
    planName: client.planName || '',
    billingCycle: client.billingCycle || '',
    planAmount: client.planAmount || 0,
    addOnAmount: client.addOnAmount || 0,
    taxAmount: client.taxAmount || 0,
    taxRate: client.taxRate || 0,
    total: client.total || 0,
    status: client.status,
    paidAt: client.paidAt,
    paymentMethodLabel: client.paymentMethodLabel || '',
    transactionId: client.transactionId || '',
  };
};

const recordSubscriptionPayment = async (agencyId, {
  plan,
  amount,
  transactionId = '',
  paymentMethod = null,
  status = 'Paid',
  paidAt = null,
} = {}) => {
  const agency = await Model.AgencyModel.findById(agencyId);
  if (!agency) throw new Error('Agency Not Found');

  const planAmount = roundMoney(amount ?? plan?.price ?? 0);
  const addOnAmount = roundMoney(agency.addOnAmount || 0);
  const taxRate = Number(agency.taxRate || 0);
  const taxAmount = roundMoney((planAmount + addOnAmount) * taxRate);
  const total = roundMoney(planAmount + addOnAmount + taxAmount);
  const now = paidAt ? parseDateValue(paidAt) || new Date() : new Date();
  const due = new Date(now);
  due.setUTCDate(due.getUTCDate() + 7);

  if (paymentMethod?.last4) {
    const methods = Array.isArray(agency.paymentMethods) ? agency.paymentMethods : [];
    const exists = methods.some((m) => m.last4 === paymentMethod.last4 && m.brand === paymentMethod.brand);
    if (!exists) {
      if (paymentMethod.isDefault !== false) {
        methods.forEach((m) => { m.isDefault = false; });
      }
      methods.push({
        brand: paymentMethod.brand || 'Card',
        last4: paymentMethod.last4,
        expMonth: paymentMethod.expMonth || '',
        expYear: paymentMethod.expYear || '',
        nameOnCard: paymentMethod.nameOnCard || '',
        isDefault: paymentMethod.isDefault !== false,
      });
      agency.paymentMethods = methods;
      await agency.save();
    }
  }

  const invoice = await Model.AgencySubscriptionInvoiceModel.create({
    agencyId: agency._id,
    invoiceCode: await generateInvoiceCode(agency._id),
    invoiceDate: now,
    dueDate: due,
    planName: plan?.name || '',
    billingCycle: plan?.billingCycle || 'monthly',
    planAmount,
    addOnAmount,
    taxAmount,
    taxRate,
    total,
    status,
    paidAt: status === 'Paid' ? now : null,
    paymentMethodLabel: paymentMethodLabel(paymentMethod) || paymentMethodLabel(
      (agency.paymentMethods || []).find((m) => m.isDefault) || agency.paymentMethods?.[0],
    ),
    transactionId: transactionId || '',
  });

  return formatInvoice(invoice);
};

const getBilling = async (agencyId) => {
  const agency = await Model.AgencyModel.findById(agencyId);
  if (!agency) throw new Error('Agency Not Found');

  const planDoc = agency.subscriptionPlanId
    ? await Model.SubscriptionPlanModel.findById(agency.subscriptionPlanId)
    : null;
  const plan = formatPlan(planDoc);
  const [usage, storageUsed, invoiceDocs] = await Promise.all([
    getLiveUsage(agency._id, agency),
    getStorageUsage(agency._id),
    Model.AgencySubscriptionInvoiceModel.find({ agencyId: agency._id })
      .sort({ invoiceDate: -1, createdAt: -1 })
      .limit(20)
      .lean(),
  ]);

  let invoices = invoiceDocs.map(formatInvoice);
  if (plan && invoices.length === 0) {
    const seeded = await recordSubscriptionPayment(agency._id, {
      plan,
      amount: plan.price,
      status: agency.status === 'Active' ? 'Paid' : 'Pending',
      paidAt: agency.createdAt || agency.registeredAt,
      transactionId: `signup_${agency._id}`,
    });
    invoices = [seeded];
  }

  const lastPaid = invoices.find((inv) => inv.status === 'Paid');
  const pending = invoices.find((inv) => inv.status === 'Pending' || inv.status === 'Overdue');
  const startDate = agency.registeredAt || agency.createdAt;
  const nextRenewalDate = getNextRenewalDate(
    startDate,
    plan?.billingCycle,
    lastPaid?.paidAt || lastPaid?.invoiceDate,
  );

  const planAmount = roundMoney(pending?.planAmount ?? plan?.price ?? 0);
  const addOnAmount = roundMoney(pending?.addOnAmount ?? agency.addOnAmount ?? 0);
  const taxRate = Number(pending?.taxRate ?? agency.taxRate ?? 0);
  const taxAmount = roundMoney(pending?.taxAmount ?? ((planAmount + addOnAmount) * taxRate));
  const total = roundMoney(pending?.total ?? (planAmount + addOnAmount + taxAmount));

  const paymentMethods = (agency.paymentMethods || []).map(formatPaymentMethod).filter(Boolean);
  const defaultMethod = paymentMethods.find((m) => m.isDefault) || paymentMethods[0] || null;
  const features = Array.isArray(plan?.features) && plan.features.length
    ? plan.features
    : [...(plan?.selectedFeatures || []), ...(plan?.customFeatures || [])].filter(Boolean);

  return {
    plan,
    features,
    subscription: {
      startDate: startDate || null,
      nextRenewalDate,
      daysLeft: daysUntilDate(nextRenewalDate),
      autoRenewal: agency.autoRenewal !== false && agency.status === 'Active' && Boolean(plan),
      status: agency.status || '',
    },
    usage: {
      clients: { used: usage.clients || 0, limit: plan?.limits?.maxClients ?? null },
      caregivers: { used: usage.caregivers || 0, limit: plan?.limits?.maxCaregivers ?? null },
      storage: { used: storageUsed, limit: plan?.limits?.maxStorage ?? null },
    },
    summary: {
      planAmount,
      addOnAmount,
      taxAmount,
      taxRate,
      total,
      defaultPaymentMethod: defaultMethod,
      hasPendingInvoice: Boolean(pending),
    },
    invoices: invoices.slice(0, 5),
    invoiceTotal: invoices.length,
    paymentMethods,
    payments: invoices
      .filter((inv) => inv.status === 'Paid')
      .slice(0, 6)
      .map((inv) => ({
        id: inv.id,
        date: inv.paidAt || inv.invoiceDate,
        amount: inv.total,
        label: 'Payment Successful',
        paymentMethodLabel: inv.paymentMethodLabel || '',
      })),
  };
};

const create = async (payload) => {
  const agency = await Model.AgencyModel.create(payload);
  if (payload.subscriptionPlanId) {
    const plan = await Model.SubscriptionPlanModel.findById(payload.subscriptionPlanId);
    if (plan) {
      await recordSubscriptionPayment(agency._id, {
        plan,
        amount: plan.price,
        status: 'Pending',
        transactionId: `admin_${Date.now()}`,
      });
    }
  }
  return formatAgency(agency);
};

const update = async (id, payload) => {
  const previous = await Model.AgencyModel.findById(id).select('subscriptionPlanId');
  const agency = await Model.AgencyModel.findByIdAndUpdate(id, payload, { new: true });
  if (!agency) throw new Error('Agency Not Found');

  const nextPlanId = agency.subscriptionPlanId ? String(agency.subscriptionPlanId) : '';
  const prevPlanId = previous?.subscriptionPlanId ? String(previous.subscriptionPlanId) : '';
  if (nextPlanId && nextPlanId !== prevPlanId) {
    const plan = await Model.SubscriptionPlanModel.findById(nextPlanId);
    if (plan) {
      await recordSubscriptionPayment(agency._id, {
        plan,
        amount: plan.price,
        status: 'Pending',
        transactionId: `plan_change_${Date.now()}`,
      });
    }
  }
  return getById(id);
};

const remove = async (id) => {
  const agency = await Model.AgencyModel.findByIdAndDelete(id);
  if (!agency) throw new Error('Agency Not Found');
  return true;
};

module.exports = {
  getAll,
  getOptions,
  getById,
  getCaregivers,
  getBilling,
  recordSubscriptionPayment,
  create,
  update,
  remove,
  formatAgency,
};

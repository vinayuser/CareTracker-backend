const Model = require('../../models/index');
const { DEFAULT_LEAVE_TYPES } = require('../../common/leaveConstants');

const getAgencyAccount = (req) => req.agency_owner || req.hr;

const getAgencyId = (req) => {
  const account = getAgencyAccount(req) || req.caregiver;
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return agencyId;
};

const normalizeTypes = (types) => {
  const source = Array.isArray(types) && types.length ? types : DEFAULT_LEAVE_TYPES;
  const seen = new Set();
  return source
    .map((item, index) => {
      const key = String(item.key || item.name || `type-${index}`)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `type-${index}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        key,
        name: String(item.name || 'Leave').trim() || 'Leave',
        days: Math.max(0, Number(item.days) || 0),
      };
    })
    .filter(Boolean);
};

const getOrCreatePolicy = async (agencyId) => {
  let policy = await Model.LeavePolicyModel.findOne({ agencyId });
  if (!policy) {
    policy = await Model.LeavePolicyModel.create({
      agencyId,
      types: DEFAULT_LEAVE_TYPES,
    });
  }
  if (!policy.types?.length) {
    policy.types = DEFAULT_LEAVE_TYPES;
    await policy.save();
  }
  return policy;
};

const formatPolicy = (policy) => ({
  id: String(policy._id),
  types: (policy.types || []).map((item) => ({
    key: item.key,
    name: item.name,
    days: Number(item.days) || 0,
  })),
  updatedAt: policy.updatedAt,
});

const getPolicy = async (req) => {
  const agencyId = getAgencyId(req);
  const policy = await getOrCreatePolicy(agencyId);
  return formatPolicy(policy);
};

const savePolicy = async (req, payload = {}) => {
  const agencyId = getAgencyId(req);
  const account = getAgencyAccount(req);
  const types = normalizeTypes(payload.types);
  if (!types.length) throw new Error('Add at least one leave type');

  const policy = await getOrCreatePolicy(agencyId);
  policy.types = types;
  policy.updatedByAccountId = account?._id || account?.id || null;
  await policy.save();

  if (payload.applyToExisting) {
    const year = new Date().getFullYear();
    const balances = await Model.CaregiverLeaveBalanceModel.find({ agencyId, year });
    for (const balance of balances) {
      const byKey = new Map((balance.items || []).map((item) => [item.key, item]));
      balance.items = types.map((type) => {
        const prev = byKey.get(type.key);
        const used = Number(prev?.used) || 0;
        const pending = Number(prev?.pending) || 0;
        return {
          key: type.key,
          name: type.name,
          allocated: Math.max(type.days, used + pending),
          used,
          pending,
        };
      });
      await balance.save();
    }
  }

  return formatPolicy(policy);
};

const formatBalance = (balance) => ({
  id: String(balance._id),
  caregiverAccountId: String(balance.caregiverAccountId),
  year: balance.year,
  items: (balance.items || []).map((item) => ({
    key: item.key,
    name: item.name,
    allocated: Number(item.allocated) || 0,
    used: Number(item.used) || 0,
    pending: Number(item.pending) || 0,
    available: Math.max(0, (Number(item.allocated) || 0) - (Number(item.used) || 0) - (Number(item.pending) || 0)),
  })),
});

const ensureCaregiverLeaveBalance = async (agencyId, caregiverAccountId, year = new Date().getFullYear()) => {
  let balance = await Model.CaregiverLeaveBalanceModel.findOne({
    agencyId,
    caregiverAccountId,
    year,
  });
  const policy = await getOrCreatePolicy(agencyId);
  const types = policy.types?.length ? policy.types : DEFAULT_LEAVE_TYPES;

  if (!balance) {
    balance = await Model.CaregiverLeaveBalanceModel.create({
      agencyId,
      caregiverAccountId,
      year,
      items: types.map((type) => ({
        key: type.key,
        name: type.name,
        allocated: Number(type.days) || 0,
        used: 0,
        pending: 0,
      })),
    });
    return balance;
  }

  const byKey = new Map((balance.items || []).map((item) => [item.key, item]));
  let dirty = false;
  types.forEach((type) => {
    if (byKey.has(type.key)) {
      const item = byKey.get(type.key);
      if (item.name !== type.name) {
        item.name = type.name;
        dirty = true;
      }
      return;
    }
    balance.items.push({
      key: type.key,
      name: type.name,
      allocated: Number(type.days) || 0,
      used: 0,
      pending: 0,
    });
    dirty = true;
  });
  if (dirty) await balance.save();
  return balance;
};

const getCaregiverBalance = async (agencyId, caregiverAccountId, year) => {
  const balance = await ensureCaregiverLeaveBalance(agencyId, caregiverAccountId, year || new Date().getFullYear());
  return formatBalance(balance);
};

const adjustBalance = async (balance, typeKey, field, delta) => {
  const item = (balance.items || []).find((row) => row.key === typeKey);
  if (!item) throw new Error('Leave type not found on this caregiver balance');
  item[field] = Math.max(0, (Number(item[field]) || 0) + delta);
  await balance.save();
  return item;
};

module.exports = {
  getAgencyId,
  getPolicy,
  savePolicy,
  getOrCreatePolicy,
  ensureCaregiverLeaveBalance,
  getCaregiverBalance,
  formatBalance,
  adjustBalance,
};

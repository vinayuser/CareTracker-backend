const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const {
  sanitizeModuleAccess,
  DEFAULT_ADMIN_MODULES,
  isSuperAdminRole,
} = require('../../common/adminModules');
const { assertEmailGloballyAvailable } = require('../../common/emailAvailability');

const toIsoDate = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const assertSuperAdmin = (req) => {
  const admin = req.super_admin;
  if (!admin || !isSuperAdminRole(admin.role)) {
    throw new Error(constants.MESSAGE.AUTH.UNAUTHORIZED);
  }
  return admin;
};

const formatTeamMember = (admin) => {
  const client = functions.toClientDoc(admin);
  if (!client) return null;
  return {
    id: client.id,
    name: client.name || '',
    email: client.email || '',
    role: client.role || 'ADMIN',
    status: client.status || 'Active',
    moduleAccess: isSuperAdminRole(client.role)
      ? []
      : (client.moduleAccess?.length ? client.moduleAccess : [...DEFAULT_ADMIN_MODULES]),
    createdAt: client.createdAt,
    joinedOn: toIsoDate(client.createdAt),
    createdBy: client.createdBy ? String(client.createdBy) : '',
  };
};

const getStats = async (req) => {
  assertSuperAdmin(req);
  const rows = await Model.AdminModel.find().select('role status').lean();
  return {
    total: rows.length,
    active: rows.filter((row) => row.status === 'Active').length,
    inactive: rows.filter((row) => row.status === 'Inactive').length,
    superAdmins: rows.filter((row) => isSuperAdminRole(row.role)).length,
    platformAdmins: rows.filter((row) => !isSuperAdminRole(row.role)).length,
  };
};

const getAll = async (req, query = {}) => {
  assertSuperAdmin(req);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
  const search = String(query.search || '').trim();
  const status = String(query.status || 'All');
  const role = String(query.role || 'All');

  const filter = {};
  if (status && status !== 'All') filter.status = status;
  if (role && role !== 'All') filter.role = role;
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: regex }, { email: regex }];
  }

  const [total, rows] = await Promise.all([
    Model.AdminModel.countDocuments(filter),
    Model.AdminModel.find(filter)
      .select('name email role status moduleAccess createdAt createdBy')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    list: rows.map(formatTeamMember),
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

const create = async (req, payload) => {
  const actor = assertSuperAdmin(req);
  const email = String(payload.email || '').trim().toLowerCase();
  await assertEmailGloballyAvailable(email);

  const role = isSuperAdminRole(payload.role) ? 'SUPER_ADMIN' : 'ADMIN';
  const admin = new Model.AdminModel({
    name: String(payload.name || '').trim(),
    email,
    role,
    status: payload.status || 'Active',
    moduleAccess: role === 'ADMIN' ? sanitizeModuleAccess(payload.moduleAccess) : [],
    createdBy: actor._id || actor.id,
    password: 'placeholder',
  });
  await admin.setPassword(payload.password);
  await admin.save();
  return formatTeamMember(admin);
};

const update = async (req, id, payload) => {
  assertSuperAdmin(req);
  const admin = await Model.AdminModel.findById(id);
  if (!admin) throw new Error('Team member not found');

  if (payload.email !== undefined) {
    const email = String(payload.email).trim().toLowerCase();
    await assertEmailGloballyAvailable(email, { adminId: admin._id });
    admin.email = email;
  }
  if (payload.name !== undefined) admin.name = String(payload.name).trim();
  if (payload.status !== undefined) admin.status = payload.status;
  if (payload.moduleAccess !== undefined && !isSuperAdminRole(admin.role)) {
    admin.moduleAccess = sanitizeModuleAccess(payload.moduleAccess);
  }
  if (payload.role !== undefined && isSuperAdminRole(payload.role) && !isSuperAdminRole(admin.role)) {
    admin.role = 'SUPER_ADMIN';
    admin.moduleAccess = [];
  }

  await admin.save();
  return formatTeamMember(admin);
};

const setStatus = async (req, id, status) => {
  const actor = assertSuperAdmin(req);
  const admin = await Model.AdminModel.findById(id);
  if (!admin) throw new Error('Team member not found');
  if (String(admin._id) === String(actor._id || actor.id)) {
    throw new Error('You cannot change your own account status');
  }
  admin.status = status;
  await admin.save();
  return formatTeamMember(admin);
};

const setPassword = async (req, id, password) => {
  assertSuperAdmin(req);
  const admin = await Model.AdminModel.findById(id);
  if (!admin) throw new Error('Team member not found');
  await admin.setPassword(password);
  admin.jti = functions.generateRandomStringAndNumbers(20);
  await admin.save();
  return formatTeamMember(admin);
};

const remove = async (req, id) => {
  const actor = assertSuperAdmin(req);
  const admin = await Model.AdminModel.findById(id);
  if (!admin) throw new Error('Team member not found');
  if (String(admin._id) === String(actor._id || actor.id)) {
    throw new Error('You cannot delete your own account');
  }
  if (isSuperAdminRole(admin.role)) {
    const superCount = await Model.AdminModel.countDocuments({ role: 'SUPER_ADMIN' });
    if (superCount <= 1) throw new Error('Cannot delete the last super admin');
  }
  await Model.AdminModel.findByIdAndDelete(id);
  return true;
};

module.exports = {
  getStats,
  getAll,
  create,
  update,
  setStatus,
  setPassword,
  remove,
};

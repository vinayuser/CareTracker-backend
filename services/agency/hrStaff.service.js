const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const { sanitizeModuleAccess, DEFAULT_HR_MODULES } = require('../../common/agencyModules');
const { sendHrWelcomeEmail, sendHrCustomEmail } = require('../common/mail.service');

const formatHrStaff = (doc) => {
  const client = functions.toClientDoc(doc);
  if (client) {
    client.agencyId = String(doc.agencyId?._id || doc.agencyId || '');
    client.accountId = doc.accountId ? String(doc.accountId) : '';
    client.role = client.role || 'HR';
    client.moduleAccess = doc.moduleAccess?.length ? doc.moduleAccess : [...DEFAULT_HR_MODULES];
  }
  return client;
};

const getAgencyAccount = (req) => req.agency_owner || req.hr;

const getAgencyId = (req) => {
  const account = getAgencyAccount(req);
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return agencyId;
};

const assertAgencyOwner = (req) => {
  if (!req.agency_owner) throw new Error(constants.MESSAGE.AUTH.UNAUTHORIZED);
};

const getStats = async (req) => {
  const agencyId = getAgencyId(req);
  const list = await Model.HrStaffModel.find({ agencyId });
  return {
    total: list.length,
    active: list.filter((member) => member.status === 'Active').length,
    inactive: list.filter((member) => member.status === 'Inactive').length,
    pending: list.filter((member) => member.status === 'Pending').length,
  };
};

const getAll = async (req, query = {}) => {
  const agencyId = getAgencyId(req);
  const filter = { agencyId };

  if (query.status && query.status !== 'All') {
    filter.status = query.status;
  }

  if (query.search) {
    const search = String(query.search).trim();
    const regex = new RegExp(search, 'i');
    filter.$or = [
      { firstName: regex },
      { lastName: regex },
      { email: regex },
      { employeeId: regex },
      { jobTitle: regex },
      { department: regex },
    ];
  }

  const list = await Model.HrStaffModel.find(filter).sort({ createdAt: -1 });
  return list.map(formatHrStaff);
};

const getById = async (req, id) => {
  const agencyId = getAgencyId(req);
  const member = await Model.HrStaffModel.findOne({ _id: id, agencyId });
  if (!member) throw new Error(constants.MESSAGE.HR.NOT_FOUND);
  return formatHrStaff(member);
};

const create = async (req, payload) => {
  assertAgencyOwner(req);
  const agencyId = getAgencyId(req);

  const existingAccount = await Model.AgencyAccountModel.findOne({
    $or: [{ userId: payload.userId.toLowerCase() }, { email: payload.email.toLowerCase() }],
  });
  if (existingAccount) throw new Error(constants.MESSAGE.USER.USER_ID_TAKEN);

  const existingEmployee = await Model.HrStaffModel.findOne({
    agencyId,
    $or: [{ employeeId: payload.employeeId }, { email: payload.email.toLowerCase() }],
  });
  if (existingEmployee) throw new Error(constants.MESSAGE.HR.ALREADY_EXISTS);

  const moduleAccess = sanitizeModuleAccess(payload.moduleAccess);

  const account = new Model.AgencyAccountModel({
    userId: payload.userId.toLowerCase(),
    email: payload.email.toLowerCase(),
    fullName: `${payload.firstName} ${payload.lastName}`.trim(),
    role: 'HR',
    status: payload.status || 'Active',
    agencyId,
    password: 'placeholder',
    moduleAccess,
  });
  await account.setPassword(payload.password);
  await account.save();

  const hrStaff = await Model.HrStaffModel.create({
    agencyId,
    accountId: account._id,
    firstName: payload.firstName,
    lastName: payload.lastName,
    email: payload.email.toLowerCase(),
    phone: payload.phone,
    dateOfBirth: payload.dateOfBirth || '',
    gender: payload.gender || '',
    employeeId: payload.employeeId,
    jobTitle: payload.jobTitle,
    department: payload.department || 'Human Resources',
    hireDate: payload.hireDate,
    employmentType: payload.employmentType || 'Full-time',
    workLocation: payload.workLocation || '',
    reportsTo: payload.reportsTo || '',
    streetAddress: payload.streetAddress || '',
    city: payload.city || '',
    state: payload.state || '',
    zipCode: payload.zipCode || '',
    country: payload.country || 'United States',
    emergencyContactName: payload.emergencyContactName,
    emergencyContactRelationship: payload.emergencyContactRelationship || '',
    emergencyContactPhone: payload.emergencyContactPhone,
    emergencyContactEmail: payload.emergencyContactEmail || '',
    educationLevel: payload.educationLevel || '',
    yearsOfExperience: payload.yearsOfExperience || '',
    certifications: payload.certifications || '',
    specializations: payload.specializations || '',
    userId: payload.userId.toLowerCase(),
    status: payload.status || 'Active',
    notes: payload.notes || '',
    role: 'HR',
    moduleAccess,
  });

  try {
    const agency = await Model.AgencyModel.findById(agencyId).select('name');
    await sendHrWelcomeEmail({
      to: payload.email.toLowerCase(),
      hrName: `${payload.firstName} ${payload.lastName}`.trim(),
      agencyName: agency?.name,
      email: payload.email.toLowerCase(),
      password: payload.password,
      jobTitle: payload.jobTitle,
    });
  } catch (err) {
    console.error('[hrStaff.create] welcome email failed', err.message);
  }

  return formatHrStaff(hrStaff);
};

const update = async (req, id, payload) => {
  assertAgencyOwner(req);
  const agencyId = getAgencyId(req);
  const member = await Model.HrStaffModel.findOne({ _id: id, agencyId });
  if (!member) throw new Error(constants.MESSAGE.HR.NOT_FOUND);

  const updatableFields = [
    'firstName',
    'lastName',
    'email',
    'phone',
    'dateOfBirth',
    'gender',
    'employeeId',
    'jobTitle',
    'department',
    'hireDate',
    'employmentType',
    'workLocation',
    'reportsTo',
    'streetAddress',
    'city',
    'state',
    'zipCode',
    'country',
    'emergencyContactName',
    'emergencyContactRelationship',
    'emergencyContactPhone',
    'emergencyContactEmail',
    'educationLevel',
    'yearsOfExperience',
    'certifications',
    'specializations',
    'userId',
    'status',
    'notes',
    'moduleAccess',
  ];

  updatableFields.forEach((field) => {
    if (payload[field] !== undefined) {
      member[field] = field === 'moduleAccess' ? sanitizeModuleAccess(payload.moduleAccess) : payload[field];
    }
  });

  await member.save();

  if (member.accountId) {
    const accountUpdates = {
      fullName: `${member.firstName} ${member.lastName}`.trim(),
      email: member.email,
      status: member.status,
    };
    if (payload.userId) accountUpdates.userId = payload.userId.toLowerCase();
    if (payload.moduleAccess !== undefined) {
      accountUpdates.moduleAccess = sanitizeModuleAccess(payload.moduleAccess);
    }
    if (payload.password) {
      const account = await Model.AgencyAccountModel.findById(member.accountId);
      if (account) {
        await account.setPassword(payload.password);
        Object.assign(account, accountUpdates);
        await account.save();
      }
    } else {
      await Model.AgencyAccountModel.findByIdAndUpdate(member.accountId, accountUpdates);
    }
  }

  return formatHrStaff(member);
};

const updateStatus = async (req, id, status) => {
  assertAgencyOwner(req);
  const agencyId = getAgencyId(req);
  const member = await Model.HrStaffModel.findOne({ _id: id, agencyId });
  if (!member) throw new Error(constants.MESSAGE.HR.NOT_FOUND);

  member.status = status;
  await member.save();

  if (member.accountId) {
    await Model.AgencyAccountModel.findByIdAndUpdate(member.accountId, { status });
  }

  return formatHrStaff(member);
};

const setPassword = async (req, id, password) => {
  assertAgencyOwner(req);
  const agencyId = getAgencyId(req);
  const member = await Model.HrStaffModel.findOne({ _id: id, agencyId });
  if (!member) throw new Error(constants.MESSAGE.HR.NOT_FOUND);
  if (!member.accountId) throw new Error(constants.MESSAGE.HR.NOT_FOUND);

  const account = await Model.AgencyAccountModel.findById(member.accountId);
  if (!account) throw new Error(constants.MESSAGE.HR.NOT_FOUND);

  await account.setPassword(password);
  // Invalidate existing sessions
  account.jti = functions.generateRandomStringAndNumbers(20);
  await account.save();

  return formatHrStaff(member);
};

const sendEmail = async (req, id, payload) => {
  assertAgencyOwner(req);
  const agencyId = getAgencyId(req);
  const member = await Model.HrStaffModel.findOne({ _id: id, agencyId });
  if (!member) throw new Error(constants.MESSAGE.HR.NOT_FOUND);
  if (!member.email) throw new Error('HR staff email not found');

  const [agency] = await Promise.all([
    Model.AgencyModel.findById(agencyId).select('name'),
  ]);
  const owner = req.agency_owner;

  await sendHrCustomEmail({
    to: member.email,
    hrName: `${member.firstName || ''} ${member.lastName || ''}`.trim(),
    agencyName: agency?.name,
    subject: payload.subject,
    message: payload.message,
    senderName: owner?.fullName || owner?.name || '',
  });

  return {
    id: String(member._id),
    email: member.email,
    subject: payload.subject,
  };
};

module.exports = {
  getStats,
  getAll,
  getById,
  create,
  update,
  updateStatus,
  setPassword,
  sendEmail,
  formatHrStaff,
};

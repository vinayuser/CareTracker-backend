const crypto = require('crypto');
const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const Auth = require('../../common/authenticate');
const { sanitizeModuleAccess, DEFAULT_HR_MODULES } = require('../../common/agencyModules');
const { sendPasswordResetEmail } = require('../common/mail.service');

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const createResetToken = () => crypto.randomBytes(32).toString('hex');

const formatAdminUser = (admin) => ({
  id: String(admin._id),
  name: admin.name,
  email: admin.email,
  role: admin.role || 'SUPER_ADMIN',
});

const splitName = (fullName = '') => {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
};

const formatAgencyUser = async (account) => {
  const role = account.role || 'AGENCY_OWNER';
  const user = {
    id: String(account._id),
    name: account.fullName,
    email: account.email,
    role,
    agencyName: account.agencyId?.name || '',
    agencyId: account.agencyId?._id ? String(account.agencyId._id) : '',
    userId: account.userId || '',
    phone: account.phone || '',
    dateOfBirth: account.dateOfBirth || '',
    employeeId: account.employeeId || '',
    status: account.status || 'Active',
    jobTitle: '',
    department: '',
  };

  if (role === 'HR') {
    const hrStaff = await Model.HrStaffModel.findOne({ accountId: account._id });
    const moduleAccess = hrStaff?.moduleAccess?.length
      ? sanitizeModuleAccess(hrStaff.moduleAccess)
      : account.moduleAccess?.length
        ? sanitizeModuleAccess(account.moduleAccess)
        : [...DEFAULT_HR_MODULES];
    user.moduleAccess = moduleAccess;
    if (hrStaff) {
      user.phone = hrStaff.phone || user.phone;
      user.dateOfBirth = hrStaff.dateOfBirth || user.dateOfBirth;
      user.employeeId = hrStaff.employeeId || user.employeeId;
      user.jobTitle = hrStaff.jobTitle || '';
      user.department = hrStaff.department || '';
      if (hrStaff.firstName || hrStaff.lastName) {
        user.name = `${hrStaff.firstName || ''} ${hrStaff.lastName || ''}`.trim() || user.name;
      }
    }
  }

  return user;
};

const issueAgencyToken = (account) => Auth.getToken({
  _id: account._id,
  jti: account.jti,
  type: 'agency',
  role: account.role || 'AGENCY_OWNER',
});

const login = async (req) => {
  const loginId = String(req.body.email || '').trim().toLowerCase();
  if (!loginId) throw new Error(constants.MESSAGE.AUTH.INVALID_CREDENTIALS);

  const admin = await Model.AdminModel.findOne({ email: loginId });
  if (admin) {
    await admin.authenticate(req.body.password);
    admin.jti = functions.generateRandomStringAndNumbers(20);
    await admin.save();

    const token = Auth.getToken({ _id: admin._id, jti: admin.jti, type: 'admin' });

    return {
      token,
      user: formatAdminUser(admin),
    };
  }

  const account = await Model.AgencyAccountModel.findOne({
    $or: [{ email: loginId }, { userId: loginId }],
  }).populate('agencyId');

  if (!account) throw new Error(constants.MESSAGE.AUTH.INVALID_CREDENTIALS);
  if (account.status === 'Inactive') throw new Error('Account is inactive');

  try {
    await account.authenticate(req.body.password);
  } catch {
    throw new Error(constants.MESSAGE.AUTH.INVALID_CREDENTIALS);
  }
  account.jti = functions.generateRandomStringAndNumbers(20);
  await account.save();

  return {
    token: issueAgencyToken(account),
    user: await formatAgencyUser(account),
  };
};

/** Resolve current user from authenticate middleware (req.super_admin / agency_owner / hr / caregiver). */
const getMe = async (req) => {
  if (req.super_admin) {
    return formatAdminUser(req.super_admin);
  }

  const account = req.agency_owner || req.hr || req.caregiver;
  if (!account) throw new Error(constants.MESSAGE.AUTH.UNAUTHORIZED);

  const fresh = await Model.AgencyAccountModel.findById(account._id || account.id).populate('agencyId');
  if (!fresh || fresh.status === 'Inactive') {
    throw new Error(constants.MESSAGE.AUTH.UNAUTHORIZED);
  }

  return formatAgencyUser(fresh);
};

const assertEmailAvailable = async ({ email, excludeAdminId, excludeAccountId }) => {
  if (!email) return;
  const normalized = String(email).trim().toLowerCase();
  const adminClash = await Model.AdminModel.findOne({
    email: normalized,
    ...(excludeAdminId ? { _id: { $ne: excludeAdminId } } : {}),
  }).select('_id');
  if (adminClash) throw new Error(constants.MESSAGE.USER.EMAIL_ALREADY_IN_USE);

  const accountClash = await Model.AgencyAccountModel.findOne({
    email: normalized,
    ...(excludeAccountId ? { _id: { $ne: excludeAccountId } } : {}),
  }).select('_id');
  if (accountClash) throw new Error(constants.MESSAGE.USER.EMAIL_ALREADY_IN_USE);
};

const assertUserIdAvailable = async (userId, excludeAccountId) => {
  if (!userId) return;
  const normalized = String(userId).trim().toLowerCase();
  const clash = await Model.AgencyAccountModel.findOne({
    userId: normalized,
    _id: { $ne: excludeAccountId },
  }).select('_id');
  if (clash) throw new Error(constants.MESSAGE.USER.USER_ID_TAKEN);
};

const updateProfile = async (req, payload = {}) => {
  if (req.super_admin) {
    const admin = await Model.AdminModel.findById(req.super_admin._id || req.super_admin.id);
    if (!admin) throw new Error(constants.MESSAGE.AUTH.UNAUTHORIZED);

    if (payload.email !== undefined) {
      await assertEmailAvailable({ email: payload.email, excludeAdminId: admin._id });
      admin.email = String(payload.email).trim().toLowerCase();
    }
    if (payload.name !== undefined) {
      admin.name = String(payload.name).trim();
    }
    await admin.save();
    return { user: formatAdminUser(admin) };
  }

  const session = req.agency_owner || req.hr || req.caregiver;
  if (!session) throw new Error(constants.MESSAGE.AUTH.UNAUTHORIZED);

  const account = await Model.AgencyAccountModel.findById(session._id || session.id).populate('agencyId');
  if (!account || account.status === 'Inactive') {
    throw new Error(constants.MESSAGE.AUTH.UNAUTHORIZED);
  }

  if (payload.email !== undefined) {
    await assertEmailAvailable({ email: payload.email, excludeAccountId: account._id });
    account.email = String(payload.email).trim().toLowerCase();
  }
  if (payload.name !== undefined) {
    account.fullName = String(payload.name).trim();
  }
  if (payload.phone !== undefined) {
    account.phone = String(payload.phone || '').trim();
  }
  if (payload.dateOfBirth !== undefined) {
    account.dateOfBirth = String(payload.dateOfBirth || '').trim();
  }
  if (payload.employeeId !== undefined) {
    account.employeeId = String(payload.employeeId || '').trim();
  }
  if (payload.userId !== undefined) {
    await assertUserIdAvailable(payload.userId, account._id);
    account.userId = String(payload.userId).trim().toLowerCase();
  }

  await account.save();

  if (account.role === 'HR') {
    const hrStaff = await Model.HrStaffModel.findOne({ accountId: account._id });
    if (hrStaff) {
      if (payload.name !== undefined) {
        const { firstName, lastName } = splitName(account.fullName);
        hrStaff.firstName = firstName;
        hrStaff.lastName = lastName;
      }
      if (payload.email !== undefined) hrStaff.email = account.email;
      if (payload.phone !== undefined) hrStaff.phone = account.phone;
      if (payload.dateOfBirth !== undefined) hrStaff.dateOfBirth = account.dateOfBirth;
      if (payload.employeeId !== undefined) hrStaff.employeeId = account.employeeId;
      if (payload.userId !== undefined) hrStaff.userId = account.userId;
      if (payload.jobTitle !== undefined) hrStaff.jobTitle = String(payload.jobTitle || '').trim();
      if (payload.department !== undefined) hrStaff.department = String(payload.department || '').trim();
      await hrStaff.save();
    }
  }

  return { user: await formatAgencyUser(account) };
};

const changePassword = async (req, payload = {}) => {
  const currentPassword = payload.currentPassword;
  const newPassword = payload.newPassword;

  if (req.super_admin) {
    const admin = await Model.AdminModel.findById(req.super_admin._id || req.super_admin.id);
    if (!admin) throw new Error(constants.MESSAGE.AUTH.UNAUTHORIZED);
    try {
      await admin.authenticate(currentPassword);
    } catch {
      throw new Error(constants.MESSAGE.AUTH.CURRENT_PASSWORD_INVALID);
    }
    await admin.setPassword(newPassword);
    admin.jti = functions.generateRandomStringAndNumbers(20);
    await admin.save();
    const token = Auth.getToken({ _id: admin._id, jti: admin.jti, type: 'admin' });
    return { user: formatAdminUser(admin), token };
  }

  const session = req.agency_owner || req.hr || req.caregiver;
  if (!session) throw new Error(constants.MESSAGE.AUTH.UNAUTHORIZED);

  const account = await Model.AgencyAccountModel.findById(session._id || session.id).populate('agencyId');
  if (!account || account.status === 'Inactive') {
    throw new Error(constants.MESSAGE.AUTH.UNAUTHORIZED);
  }

  try {
    await account.authenticate(currentPassword);
  } catch {
    throw new Error(constants.MESSAGE.AUTH.CURRENT_PASSWORD_INVALID);
  }

  await account.setPassword(newPassword);
  account.jti = functions.generateRandomStringAndNumbers(20);
  await account.save();

  return {
    user: await formatAgencyUser(account),
    token: issueAgencyToken(account),
  };
};

const forgotPassword = async (req, payload = {}) => {
  const loginId = String(payload.email || '').trim().toLowerCase();
  if (!loginId) return { sent: false };

  const resetToken = createResetToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  const resetUrl = `${functions.getFrontendUrl(req)}/reset-password?token=${encodeURIComponent(resetToken)}`;

  const admin = await Model.AdminModel.findOne({ email: loginId });
  if (admin) {
    admin.passwordResetToken = resetToken;
    admin.passwordResetExpires = expiresAt;
    await admin.save();
    await sendPasswordResetEmail({
      to: admin.email,
      name: admin.name,
      resetUrl,
      expiresAt,
      req,
    });
    return { sent: true };
  }

  const account = await Model.AgencyAccountModel.findOne({
    $or: [{ email: loginId }, { userId: loginId }],
  });

  if (account && account.status !== 'Inactive' && account.email) {
    account.passwordResetToken = resetToken;
    account.passwordResetExpires = expiresAt;
    await account.save();
    await sendPasswordResetEmail({
      to: account.email,
      name: account.fullName,
      resetUrl,
      expiresAt,
      req,
    });
    return { sent: true };
  }

  return { sent: false };
};

const resetPassword = async (payload = {}) => {
  const token = String(payload.token || '').trim();
  const password = payload.password;
  if (!token || !password) throw new Error(constants.MESSAGE.AUTH.RESET_TOKEN_INVALID);

  const now = new Date();
  const admin = await Model.AdminModel.findOne({
    passwordResetToken: token,
    passwordResetExpires: { $gt: now },
  });

  if (admin) {
    await admin.setPassword(password);
    admin.passwordResetToken = '';
    admin.passwordResetExpires = null;
    admin.jti = functions.generateRandomStringAndNumbers(20);
    await admin.save();
    return { role: admin.role || 'SUPER_ADMIN' };
  }

  const account = await Model.AgencyAccountModel.findOne({
    passwordResetToken: token,
    passwordResetExpires: { $gt: now },
  });

  if (!account || account.status === 'Inactive') {
    throw new Error(constants.MESSAGE.AUTH.RESET_TOKEN_INVALID);
  }

  await account.setPassword(password);
  account.passwordResetToken = '';
  account.passwordResetExpires = null;
  account.jti = functions.generateRandomStringAndNumbers(20);
  await account.save();
  return { role: account.role || 'AGENCY_OWNER' };
};

module.exports = {
  login,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
};

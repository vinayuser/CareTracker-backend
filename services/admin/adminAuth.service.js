const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const Auth = require('../../common/authenticate');
const { sanitizeModuleAccess, DEFAULT_HR_MODULES } = require('../../common/agencyModules');

const formatAdminUser = (admin) => ({
  id: String(admin._id),
  name: admin.name,
  email: admin.email,
  role: admin.role || 'SUPER_ADMIN',
});

const formatAgencyUser = async (account) => {
  const role = account.role || 'AGENCY_OWNER';
  const user = {
    id: String(account._id),
    name: account.fullName,
    email: account.email,
    role,
    agencyName: account.agencyId?.name || '',
    agencyId: account.agencyId?._id ? String(account.agencyId._id) : '',
  };

  if (role === 'HR') {
    const hrStaff = await Model.HrStaffModel.findOne({ accountId: account._id });
    const moduleAccess = hrStaff?.moduleAccess?.length
      ? sanitizeModuleAccess(hrStaff.moduleAccess)
      : account.moduleAccess?.length
        ? sanitizeModuleAccess(account.moduleAccess)
        : [...DEFAULT_HR_MODULES];
    user.moduleAccess = moduleAccess;
  }

  return user;
};

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

  const role = account.role || 'AGENCY_OWNER';
  const token = Auth.getToken({
    _id: account._id,
    jti: account.jti,
    type: 'agency',
    role,
  });

  return {
    token,
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

module.exports = { login, getMe };

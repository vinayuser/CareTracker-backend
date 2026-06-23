const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const Auth = require('../../common/authenticate');
const { sanitizeModuleAccess, DEFAULT_HR_MODULES } = require('../../common/agencyModules');

const login = async (req) => {
  const email = req.body.email.toLowerCase();

  const admin = await Model.AdminModel.findOne({ email });
  if (admin) {
    await admin.authenticate(req.body.password);
    admin.jti = functions.generateRandomStringAndNumbers(20);
    await admin.save();

    const token = Auth.getToken({ _id: admin._id, jti: admin.jti, type: 'admin' });

    return {
      token,
      user: {
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    };
  }

  const account = await Model.AgencyAccountModel.findOne({
    $or: [{ email }, { userId: email }],
  }).populate('agencyId');

  if (!account) throw new Error(constants.MESSAGE.AUTH.INVALID_CREDENTIALS);
  if (account.status === 'Inactive') throw new Error('Account is inactive');

  await account.authenticate(req.body.password);
  account.jti = functions.generateRandomStringAndNumbers(20);
  await account.save();

  const role = account.role || 'AGENCY_OWNER';
  const token = Auth.getToken({
    _id: account._id,
    jti: account.jti,
    type: 'agency',
    role,
  });

  const user = {
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

  return {
    token,
    user,
  };
};

module.exports = { login };

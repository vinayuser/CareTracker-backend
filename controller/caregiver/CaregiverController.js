const constants = require('../../common/constants');
const Model = require('../../models/index');
const functions = require('../../common/functions');

const getCaregiverAccount = (req) => req.caregiver;

module.exports.getProfile = async (req, res, next) => {
  try {
    const account = getCaregiverAccount(req);
    if (!account) throw new Error(constants.MESSAGE.AUTH.UNAUTHORIZED);

    const populated = await Model.AgencyAccountModel.findById(account._id).populate('agencyId');
    const profile = functions.toClientDoc(populated);
    profile.agencyName = populated?.agencyId?.name || '';
    profile.agencyId = populated?.agencyId?._id ? String(populated.agencyId._id) : '';
    profile.role = 'CAREGIVER';

    return res.success(constants.MESSAGE.SUCCESS, profile);
  } catch (error) {
    next(error);
  }
};

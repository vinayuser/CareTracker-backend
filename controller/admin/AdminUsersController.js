const constants = require('../../common/constants');
const AdminUsersService = require('../../services/admin/adminUsers.service');

const requireAgencyId = (agencyId) => {
  if (!agencyId) {
    const err = new Error('agencyId is required');
    err.statusCode = 400;
    throw err;
  }
  return agencyId;
};

module.exports.getStats = async (req, res, next) => {
  try {
    const data = await AdminUsersService.getStats(requireAgencyId(req.query.agencyId));
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getUsers = async (req, res, next) => {
  try {
    const { agencyId, ...query } = req.query;
    const data = await AdminUsersService.getUsers(requireAgencyId(agencyId), query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getSchedules = async (req, res, next) => {
  try {
    const { agencyId, ...query } = req.query;
    const data = await AdminUsersService.getSchedules(requireAgencyId(agencyId), query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getEvvForms = async (req, res, next) => {
  try {
    const { agencyId, ...query } = req.query;
    const data = await AdminUsersService.getEvvForms(requireAgencyId(agencyId), query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

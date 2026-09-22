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

module.exports.getEvvFormDetail = async (req, res, next) => {
  try {
    const data = await AdminUsersService.getEvvFormDetail(
      requireAgencyId(req.query.agencyId),
      req.params.id,
    );
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getUserById = async (req, res, next) => {
  try {
    const data = await AdminUsersService.getUserById(
      requireAgencyId(req.query.agencyId),
      req.params.id,
    );
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.updateStatus = async (req, res, next) => {
  try {
    const status = req.body?.status;
    if (!status || !['Active', 'Inactive', 'Pending'].includes(String(status))) {
      const err = new Error('status must be Active, Inactive, or Pending');
      err.statusCode = 400;
      throw err;
    }
    const data = await AdminUsersService.updateStatus(
      requireAgencyId(req.query.agencyId || req.body?.agencyId),
      req.params.id,
      status,
    );
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

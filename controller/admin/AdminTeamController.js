const constants = require('../../common/constants');
const AdminTeamService = require('../../services/admin/adminTeam.service');

module.exports.getStats = async (req, res, next) => {
  try {
    const data = await AdminTeamService.getStats(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getAll = async (req, res, next) => {
  try {
    const data = await AdminTeamService.getAll(req, req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.create = async (req, res, next) => {
  try {
    const data = await AdminTeamService.create(req, req.body);
    return res.success(constants.MESSAGE.RECORD_CREATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.update = async (req, res, next) => {
  try {
    const data = await AdminTeamService.update(req, req.params.id, req.body);
    return res.success(constants.MESSAGE.RECORD_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.setStatus = async (req, res, next) => {
  try {
    const data = await AdminTeamService.setStatus(req, req.params.id, req.body.status);
    return res.success(constants.MESSAGE.RECORD_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.setPassword = async (req, res, next) => {
  try {
    const data = await AdminTeamService.setPassword(req, req.params.id, req.body.password);
    return res.success(constants.MESSAGE.RECORD_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.remove = async (req, res, next) => {
  try {
    await AdminTeamService.remove(req, req.params.id);
    return res.success(constants.MESSAGE.RECORD_DELETED, {});
  } catch (error) {
    next(error);
  }
};

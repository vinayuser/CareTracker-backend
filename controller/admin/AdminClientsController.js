const constants = require('../../common/constants');
const AdminClientsService = require('../../services/admin/adminClients.service');

module.exports.getStats = async (req, res, next) => {
  try {
    const data = await AdminClientsService.getStats(req.query.agencyId);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getClients = async (req, res, next) => {
  try {
    const data = await AdminClientsService.getClients(req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getOverview = async (req, res, next) => {
  try {
    const data = await AdminClientsService.getOverview(req.params.id, req);
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
    const data = await AdminClientsService.updateStatus(req.params.id, status);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

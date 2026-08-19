const constants = require('../../common/constants');
const AdminCaregiversService = require('../../services/admin/adminCaregivers.service');

module.exports.getStats = async (req, res, next) => {
  try {
    const data = await AdminCaregiversService.getStats(req.query.agencyId);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getCaregivers = async (req, res, next) => {
  try {
    const data = await AdminCaregiversService.getCaregivers(req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getOverview = async (req, res, next) => {
  try {
    const data = await AdminCaregiversService.getOverview(req.params.id, req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

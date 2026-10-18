const constants = require('../../common/constants');
const AdminCaregiverActivityService = require('../../services/admin/adminCaregiverActivity.service');

module.exports.getLogs = async (req, res, next) => {
  try {
    const data = await AdminCaregiverActivityService.getLogs(req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getCaregivers = async (req, res, next) => {
  try {
    const data = await AdminCaregiverActivityService.listCaregivers(req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

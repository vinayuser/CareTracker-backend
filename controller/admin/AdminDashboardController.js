const constants = require('../../common/constants');
const AdminDashboardService = require('../../services/admin/adminDashboard.service');

module.exports.getDashboard = async (req, res, next) => {
  try {
    const data = await AdminDashboardService.getDashboard();
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

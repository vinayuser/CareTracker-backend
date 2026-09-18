const constants = require('../../common/constants');
const AdminEvvService = require('../../services/admin/adminEvv.service');

module.exports.getStats = async (req, res, next) => {
  try {
    const data = await AdminEvvService.getStats(req.query);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getEmployees = async (req, res, next) => {
  try {
    const data = await AdminEvvService.getEmployees(req.query, req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getEmployeeDetail = async (req, res, next) => {
  try {
    const data = await AdminEvvService.getEmployeeDetail(req.params.id, req.query, req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

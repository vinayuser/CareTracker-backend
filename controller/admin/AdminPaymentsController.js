const AdminPaymentsService = require('../../services/admin/adminPayments.service');
const constants = require('../../common/constants');

module.exports.getStats = async (req, res, next) => {
  try {
    const data = await AdminPaymentsService.getStats(req.query);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.list = async (req, res, next) => {
  try {
    const data = await AdminPaymentsService.listPayments(req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getById = async (req, res, next) => {
  try {
    const data = await AdminPaymentsService.getPaymentById(req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

const constants = require('../../common/constants');
const AdminFinanceService = require('../../services/admin/adminFinance.service');

module.exports.getStats = async (req, res, next) => {
  try {
    const data = await AdminFinanceService.getStats(req.query);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getGroupedLines = async (req, res, next) => {
  try {
    const data = await AdminFinanceService.getGroupedLines(req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getInvoiceById = async (req, res, next) => {
  try {
    const data = await AdminFinanceService.getInvoiceById(req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

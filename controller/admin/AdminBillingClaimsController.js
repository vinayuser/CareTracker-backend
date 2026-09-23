const constants = require('../../common/constants');
const AdminBillingClaimsService = require('../../services/admin/adminBillingClaims.service');

module.exports.getStats = async (req, res, next) => {
  try {
    const data = await AdminBillingClaimsService.getStats(req.query);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getInvoices = async (req, res, next) => {
  try {
    const data = await AdminBillingClaimsService.getInvoices(req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getInvoiceById = async (req, res, next) => {
  try {
    const data = await AdminBillingClaimsService.getInvoiceById(req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

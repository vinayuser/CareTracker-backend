const constants = require('../../common/constants');
const AdminEvvSummaryReportService = require('../../services/admin/adminEvvSummaryReport.service');
const ReportReminderService = require('../../services/admin/reportReminder.service');
const AgencyOperationsReportService = require('../../services/agency/agencyOperationsReport.service');

module.exports.getOptions = async (req, res, next) => {
  try {
    const data = await AdminEvvSummaryReportService.getOptions(req.query);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getOperationsCatalog = async (req, res, next) => {
  try {
    return res.success(constants.MESSAGE.SUCCESS, { reports: AgencyOperationsReportService.listCatalog() });
  } catch (error) {
    next(error);
  }
};

module.exports.getOperationsReport = async (req, res, next) => {
  try {
    const agencyId = String(req.query.agencyId || '').trim();
    if (!agencyId) {
      const error = new Error('Agency is required');
      error.statusCode = 400;
      throw error;
    }
    const data = await AgencyOperationsReportService.runReport(agencyId, req.params.key, req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.exportOperationsReport = async (req, res, next) => {
  try {
    const agencyId = String(req.query.agencyId || '').trim();
    if (!agencyId) {
      const error = new Error('Agency is required');
      error.statusCode = 400;
      throw error;
    }
    // agencyId may be a single id or "all" for every agency
    const { filename, csv } = await AgencyOperationsReportService.exportCsv(agencyId, req.params.key, req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (error) {
    next(error);
  }
};

module.exports.getList = async (req, res, next) => {
  try {
    const data = await AdminEvvSummaryReportService.getList(req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.exportCsv = async (req, res, next) => {
  try {
    const { filename, csv } = await AdminEvvSummaryReportService.exportCsv(req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (error) {
    next(error);
  }
};

module.exports.sendReminder = async (req, res, next) => {
  try {
    const data = await ReportReminderService.sendReminder({
      agencyId: req.body?.agencyId,
      clientId: req.body?.clientId,
      caregiverId: req.body?.caregiverId,
      type: req.body?.type,
      clientEvvStatus: req.body?.clientEvvStatus,
    });
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

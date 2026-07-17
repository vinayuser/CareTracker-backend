const Validation = require('../../validation/index');
const constants = require('../../common/constants');
const ClientInvoiceService = require('../../services/agency/clientInvoice.service');

module.exports.getAll = async (req, res, next) => {
  try {
    const data = await ClientInvoiceService.getAll(req, req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getById = async (req, res, next) => {
  try {
    const data = await ClientInvoiceService.getById(req, req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.generate = async (req, res, next) => {
  try {
    await Validation.ClientInvoice.generate.validateAsync(req.body);
    const data = await ClientInvoiceService.generateDraft(req, req.body);
    return res.success(constants.MESSAGE.INVOICE.CREATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.send = async (req, res, next) => {
  try {
    const data = await ClientInvoiceService.sendInvoice(req, req.params.id);
    return res.success(constants.MESSAGE.INVOICE.SENT, data);
  } catch (error) {
    next(error);
  }
};

module.exports.markPaid = async (req, res, next) => {
  try {
    const data = await ClientInvoiceService.markPaid(req, req.params.id);
    return res.success(constants.MESSAGE.INVOICE.UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.void = async (req, res, next) => {
  try {
    const data = await ClientInvoiceService.voidInvoice(req, req.params.id);
    return res.success(constants.MESSAGE.INVOICE.VOIDED, data);
  } catch (error) {
    next(error);
  }
};

const constants = require('../../common/constants');
const functions = require('../../common/functions');
const MailchimpService = require('../../services/common/mailchimp.service');
const AdminMarketingAudienceService = require('../../services/admin/adminMarketingAudience.service');
const AdminMarketingService = require('../../services/admin/adminMarketing.service');
const EmailPreferenceService = require('../../services/common/emailPreference.service');

module.exports.getState = async (req, res, next) => {
  try {
    const data = await AdminMarketingService.getState();
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.saveState = async (req, res, next) => {
  try {
    const data = await AdminMarketingService.saveState(req.body || {});
    return res.success(constants.MESSAGE.RECORD_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getPlatformAudience = async (req, res, next) => {
  try {
    const data = await AdminMarketingAudienceService.getPlatformAudience();
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getMailchimpStatus = async (req, res, next) => {
  try {
    const data = await MailchimpService.getStatus();
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getMailchimpLists = async (req, res, next) => {
  try {
    const data = await MailchimpService.getLists();
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.sendCampaign = async (req, res, next) => {
  try {
    const subject = String(req.body.subject || '').trim();
    const html = String(req.body.html || '').trim();
    const fromName = String(req.body.fromName || 'CareTracker').trim();
    const replyTo = String(req.body.fromEmail || req.body.replyTo || '').trim();
    const incoming = Array.isArray(req.body.recipients) ? req.body.recipients : [];
    const blocked = await EmailPreferenceService.blockedEmails(incoming.map((person) => person?.email));
    const recipients = incoming
      .filter((person) => person?.email && !blocked.has(String(person.email).trim().toLowerCase()))
      .slice(0, 100);
    if (!subject || !html) throw new Error('Subject and email content are required');
    if (!replyTo) throw new Error('A Mailchimp from email is required');
    if (!recipients.length) throw new Error('This campaign has no recipients to send to');

    const data = await MailchimpService.sendCampaign({
      subject,
      html,
      fromName,
      replyTo,
      recipients,
      apiBaseUrl: functions.getApiBaseUrl(req),
    });
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

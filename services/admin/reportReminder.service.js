const Model = require('../../models/index');
const MailService = require('../common/mail.service');
const { getAgencyContext } = require('../common/notifyHelpers');

const REMINDER_TYPES = {
  care_plan: {
    label: 'Care Plan Pending',
    recipient: 'agency',
  },
  schedule: {
    label: 'Schedule Pending',
    recipient: 'agency',
  },
  evv_form: {
    label: 'EVV Form Pending',
    recipient: 'caregiver',
  },
  client_evv: {
    label: 'Client EVV Verification Pending',
    recipient: 'client',
  },
  agency_evv: {
    label: 'Agency EVV Verification Pending',
    recipient: 'agency',
  },
};

const COMPANY_NAME = process.env.COMPANY_NAME || 'CareTraker';

const displayName = (value, fallback = '—') => {
  const text = String(value || '').trim();
  return text || fallback;
};

const loadAssignment = async ({ agencyId, clientId, caregiverId }) => {
  if (!agencyId || !caregiverId) throw new Error('Agency and caregiver are required');

  const [agencyCtx, caregiver, client] = await Promise.all([
    getAgencyContext(agencyId),
    Model.AgencyAccountModel.findOne({
      _id: caregiverId,
      agencyId,
    }).select('fullName email status').lean(),
    clientId
      ? Model.ClientModel.findOne({ _id: clientId, agencyId }).select('firstName lastName email').lean()
      : null,
  ]);

  if (!agencyCtx?.agencyName && !agencyCtx?.ownerEmails?.length) {
    throw new Error('Agency not found');
  }
  if (!caregiver) throw new Error('Caregiver not found');

  const clientName = client
    ? `${client.firstName || ''} ${client.lastName || ''}`.trim() || '—'
    : '—';

  return {
    agencyId: String(agencyId),
    agencyName: displayName(agencyCtx.agencyName, 'Agency'),
    agencyAdminName: displayName(agencyCtx.ownerName, agencyCtx.agencyName || 'Agency Admin'),
    agencyEmails: agencyCtx.ownerEmails || [],
    clientId: clientId ? String(clientId) : '',
    clientName,
    clientEmail: String(client?.email || '').trim().toLowerCase(),
    caregiverId: String(caregiverId),
    caregiverName: displayName(caregiver.fullName, 'Caregiver'),
    caregiverEmail: String(caregiver.email || '').trim().toLowerCase(),
    clientEvvStatus: 'Pending',
  };
};

const assertRecipient = (type, assignment) => {
  const meta = REMINDER_TYPES[type];
  if (!meta) throw new Error('Invalid reminder type');

  if (meta.recipient === 'agency') {
    if (!assignment.agencyEmails.length) {
      throw new Error('No agency email found for this assignment');
    }
    return assignment.agencyEmails;
  }
  if (meta.recipient === 'caregiver') {
    if (!assignment.caregiverEmail) {
      throw new Error('No caregiver email found for this assignment');
    }
    return [assignment.caregiverEmail];
  }
  if (meta.recipient === 'client') {
    if (!assignment.clientEmail) {
      throw new Error('No client email found for this assignment');
    }
    return [assignment.clientEmail];
  }
  throw new Error('Unsupported reminder recipient');
};

const sendReminder = async ({ agencyId, clientId, caregiverId, type, clientEvvStatus }) => {
  const reminderType = String(type || '').trim();
  if (!REMINDER_TYPES[reminderType]) {
    throw new Error('Invalid reminder type');
  }

  const assignment = await loadAssignment({ agencyId, clientId, caregiverId });
  if (clientEvvStatus) assignment.clientEvvStatus = displayName(clientEvvStatus, 'Pending');

  const to = assertRecipient(reminderType, assignment);
  const result = await MailService.sendReportReminderEmail({
    type: reminderType,
    to,
    agencyName: assignment.agencyName,
    agencyAdminName: assignment.agencyAdminName,
    clientName: assignment.clientName,
    caregiverName: assignment.caregiverName,
    clientEvvStatus: assignment.clientEvvStatus,
    companyName: COMPANY_NAME,
  });

  return {
    type: reminderType,
    label: REMINDER_TYPES[reminderType].label,
    to,
    sent: Boolean(result?.sent),
    devMode: Boolean(result?.devMode),
    assignment: {
      agencyId: assignment.agencyId,
      agencyName: assignment.agencyName,
      clientId: assignment.clientId,
      clientName: assignment.clientName,
      caregiverId: assignment.caregiverId,
      caregiverName: assignment.caregiverName,
    },
  };
};

module.exports = {
  REMINDER_TYPES,
  sendReminder,
};

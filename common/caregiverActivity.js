const Model = require('../models/index');

const ACTIVITY_TYPES = ['Session', 'Profile', 'Schedule', 'Worklog', 'EVV', 'Leave', 'Care plan'];

/**
 * Persist one caregiver activity. Failures are logged and never block the caller.
 */
const recordCaregiverActivity = async (entry = {}) => {
  try {
    if (!entry.caregiverAccountId && !entry.caregiverName) return null;

    let agencyName = entry.agencyName || '';
    if (!agencyName && entry.agencyId) {
      const agency = await Model.AgencyModel.findById(entry.agencyId).select('name').lean();
      agencyName = agency?.name || '';
    }

    let caregiverName = entry.caregiverName || '';
    if (!caregiverName && entry.caregiverAccountId) {
      const account = await Model.AgencyAccountModel.findById(entry.caregiverAccountId).select('fullName').lean();
      caregiverName = account?.fullName || '';
    }

    return await Model.CaregiverActivityModel.create({
      at: entry.at || new Date(),
      agencyId: entry.agencyId || null,
      agencyName,
      caregiverAccountId: entry.caregiverAccountId || null,
      caregiverName,
      activityType: entry.activityType || '',
      action: entry.action || '',
      activity: entry.activity || '',
      related: entry.related || '',
      detail: entry.detail || '',
      status: entry.status || 'Recorded',
      entityType: entry.entityType || '',
      entityId: entry.entityId ? String(entry.entityId) : '',
    });
  } catch (err) {
    console.error('[caregiverActivity]', err.message);
    return null;
  }
};

module.exports = { recordCaregiverActivity, ACTIVITY_TYPES };

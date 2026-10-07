const Model = require('../../models/index');
const { notArchivedFilter } = require('../../common/agencyVisibility');

const ROLE_LABELS = {
  AGENCY_OWNER: 'Agency Owner',
  HR: 'Office Staff',
  CAREGIVER: 'Caregiver',
};

const STATUS_LABELS = {
  Active: 'Active',
  Inactive: 'Inactive',
  Pending: 'Invited',
};

/**
 * Agencies + platform login users for email-campaign audience targeting.
 * Agencies include those with no users so admins can still pick them.
 */
const getPlatformAudience = async () => {
  const agencies = await Model.AgencyModel.find(notArchivedFilter())
    .select('name status')
    .sort({ name: 1 })
    .lean();

  const agencyIds = agencies.map((a) => a._id);
  const accounts = agencyIds.length
    ? await Model.AgencyAccountModel.find({
      agencyId: { $in: agencyIds },
      role: { $in: ['AGENCY_OWNER', 'HR', 'CAREGIVER'] },
    })
      .select('fullName email role status agencyId')
      .lean()
    : [];

  const countByAgency = new Map();
  for (const account of accounts) {
    const key = String(account.agencyId || '');
    countByAgency.set(key, (countByAgency.get(key) || 0) + 1);
  }

  const agencyNameById = new Map(agencies.map((a) => [String(a._id), a.name || '']));

  return {
    agencies: agencies.map((agency) => {
      const id = String(agency._id);
      return {
        id,
        name: agency.name || '',
        status: agency.status || 'Active',
        userCount: countByAgency.get(id) || 0,
      };
    }),
    users: accounts.map((account) => ({
      id: String(account._id),
      name: account.fullName || '',
      email: account.email || '',
      role: ROLE_LABELS[account.role] || account.role || '',
      agency: agencyNameById.get(String(account.agencyId)) || '',
      agencyId: String(account.agencyId || ''),
      status: STATUS_LABELS[account.status] || account.status || 'Active',
      optedOut: false,
    })),
  };
};

module.exports = { getPlatformAudience };

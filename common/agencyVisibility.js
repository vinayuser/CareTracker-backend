/**
 * Agency visibility / access helpers.
 * Archived agencies are hidden from admin operational data and cannot log in.
 */

const ARCHIVED_STATUS = 'Archived';

/** Statuses that block agency portal login (owner, HR, caregiver, client). */
const LOGIN_BLOCKED_STATUSES = new Set([ARCHIVED_STATUS]);

const notArchivedFilter = () => ({ status: { $ne: ARCHIVED_STATUS } });

const isAgencyLoginBlocked = (agency) => {
  if (!agency) return true;
  const status = typeof agency === 'string' ? agency : agency.status;
  return LOGIN_BLOCKED_STATUSES.has(status);
};

module.exports = {
  ARCHIVED_STATUS,
  LOGIN_BLOCKED_STATUSES,
  notArchivedFilter,
  isAgencyLoginBlocked,
};

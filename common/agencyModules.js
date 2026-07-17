/** Keep in sync with admin/src/constants/agencyModules.js */
const OWNER_ONLY_MODULES = [
  'AGENCY_HR_STAFF',
];

const MODULE_GROUPS = [
  { title: 'Overview', keys: ['AGENCY_DASHBOARD'] },
  {
    title: 'Client Management',
    keys: [
      'AGENCY_ASSESSMENTS',
      'AGENCY_CLIENTS',
      'AGENCY_CARE_PLANS',
      'AGENCY_SCHEDULE',
      'AGENCY_INSURANCE_INTAKE',
    ],
  },
  {
    title: 'EVV',
    keys: [
      'AGENCY_EVV_DASHBOARD',
      'AGENCY_EVV_LOGS',
      'AGENCY_EVV_EXCEPTIONS',
      'AGENCY_EVV_UNVERIFIED',
      'AGENCY_EVV_ENROLLMENTS',
      'AGENCY_EVV_SETTINGS',
    ],
  },
  {
    title: 'Billing',
    keys: ['AGENCY_BILLING'],
  },
  {
    title: 'Caregivers',
    keys: ['AGENCY_CAREGIVERS'],
  },
  {
    title: 'Human Resources',
    keys: ['AGENCY_HIRING_PIPELINE', 'AGENCY_JOBS', 'AGENCY_CANDIDATES'],
  },
];

const MODULE_LABELS = {
  AGENCY_DASHBOARD: 'Dashboard',
  AGENCY_CLIENTS: 'Clients',
  AGENCY_INSURANCE_INTAKE: 'Insurance Intake',
  AGENCY_ASSESSMENTS: 'Assessments',
  AGENCY_CARE_PLANS: 'Care Plans',
  AGENCY_SCHEDULE: 'Schedules',
  AGENCY_EVV_DASHBOARD: 'EVV Dashboard',
  AGENCY_EVV_LOGS: 'EVV Logs',
  AGENCY_EVV_EXCEPTIONS: 'Exceptions',
  AGENCY_EVV_UNVERIFIED: 'Unverified Visits',
  AGENCY_EVV_ENROLLMENTS: 'Enrollments',
  AGENCY_EVV_SETTINGS: 'EVV Settings',
  AGENCY_BILLING: 'Invoices',
  AGENCY_CAREGIVERS: 'Caregivers',
  AGENCY_HIRING_PIPELINE: 'Hiring Pipeline',
  AGENCY_JOBS: 'Jobs',
  AGENCY_CANDIDATES: 'Candidates',
};

const HR_ASSIGNABLE_MODULES = [...new Set(MODULE_GROUPS.flatMap((group) => group.keys))];

const DEFAULT_HR_MODULES = [
  'AGENCY_DASHBOARD',
  'AGENCY_CAREGIVERS',
  'AGENCY_HIRING_PIPELINE',
  'AGENCY_JOBS',
  'AGENCY_CANDIDATES',
];

const sanitizeModuleAccess = (modules) => {
  if (!Array.isArray(modules)) return [...DEFAULT_HR_MODULES];
  const allowed = new Set(HR_ASSIGNABLE_MODULES);
  const unique = [...new Set(modules.filter((key) => allowed.has(key)))];
  return unique.length > 0 ? unique : [...DEFAULT_HR_MODULES];
};

module.exports = {
  OWNER_ONLY_MODULES,
  MODULE_GROUPS,
  MODULE_LABELS,
  HR_ASSIGNABLE_MODULES,
  DEFAULT_HR_MODULES,
  sanitizeModuleAccess,
};

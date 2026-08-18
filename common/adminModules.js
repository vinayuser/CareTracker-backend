/** Keep in sync with admin/src/constants/adminModules.js */
const OWNER_ONLY_MODULES = [
  'ADMIN_TEAM',
];

const MODULE_GROUPS = [
  { title: 'Overview', keys: ['ADMIN_DASHBOARD'] },
  {
    title: 'Agencies & Access',
    keys: ['ADMIN_AGENCIES', 'ADMIN_INVITATIONS', 'ADMIN_USERS'],
  },
  {
    title: 'Care Operations',
    keys: [
      'ADMIN_CLIENTS',
      'ADMIN_CAREGIVERS',
      'ADMIN_SCHEDULES',
      'ADMIN_EVV_COMPLIANCE',
      'ADMIN_MEDICAID',
    ],
  },
  {
    title: 'Finance',
    keys: [
      'ADMIN_BILLING_CLAIMS',
      'ADMIN_FINANCE',
      'ADMIN_SUBSCRIPTION_PLANS',
      'ADMIN_PAYMENTS',
    ],
  },
  {
    title: 'Growth',
    keys: ['ADMIN_SOCIAL', 'ADMIN_MARKETING', 'ADMIN_REFERRALS', 'ADMIN_CRM'],
  },
  {
    title: 'Platform',
    keys: [
      'ADMIN_REPORTS',
      'ADMIN_AUDIT_LOGS',
      'ADMIN_INTEGRATIONS',
      'ADMIN_SUPPORT',
      'ADMIN_CONTENT',
      'ADMIN_SETTINGS',
    ],
  },
];

const MODULE_LABELS = {
  ADMIN_DASHBOARD: 'Dashboard',
  ADMIN_AGENCIES: 'Agencies',
  ADMIN_INVITATIONS: 'Invitations',
  ADMIN_USERS: 'Users',
  ADMIN_CLIENTS: 'Clients',
  ADMIN_CAREGIVERS: 'Caregivers',
  ADMIN_SCHEDULES: 'Schedules',
  ADMIN_EVV_COMPLIANCE: 'EVV & Compliance',
  ADMIN_MEDICAID: 'Medicaid',
  ADMIN_BILLING_CLAIMS: 'Billing & Claims',
  ADMIN_FINANCE: 'Finance',
  ADMIN_SUBSCRIPTION_PLANS: 'Subscriptions & Plans',
  ADMIN_PAYMENTS: 'Payments',
  ADMIN_SOCIAL: 'Social & Community',
  ADMIN_MARKETING: 'Marketing',
  ADMIN_REFERRALS: 'Referrals',
  ADMIN_CRM: 'CRM',
  ADMIN_REPORTS: 'Reports',
  ADMIN_AUDIT_LOGS: 'Audit Logs',
  ADMIN_INTEGRATIONS: 'Integrations',
  ADMIN_SUPPORT: 'Support Tickets',
  ADMIN_CONTENT: 'Content',
  ADMIN_SETTINGS: 'Settings',
};

const ADMIN_ASSIGNABLE_MODULES = [...new Set(MODULE_GROUPS.flatMap((group) => group.keys))];

const DEFAULT_ADMIN_MODULES = [
  'ADMIN_DASHBOARD',
  'ADMIN_AGENCIES',
  'ADMIN_INVITATIONS',
];

const sanitizeModuleAccess = (modules) => {
  if (!Array.isArray(modules)) return [...DEFAULT_ADMIN_MODULES];
  const allowed = new Set(ADMIN_ASSIGNABLE_MODULES);
  const unique = [...new Set(modules.filter((key) => allowed.has(key)))];
  return unique.length > 0 ? unique : [...DEFAULT_ADMIN_MODULES];
};

const isSuperAdminRole = (role) => String(role || '').toUpperCase() === 'SUPER_ADMIN';

module.exports = {
  OWNER_ONLY_MODULES,
  MODULE_GROUPS,
  MODULE_LABELS,
  ADMIN_ASSIGNABLE_MODULES,
  DEFAULT_ADMIN_MODULES,
  sanitizeModuleAccess,
  isSuperAdminRole,
};

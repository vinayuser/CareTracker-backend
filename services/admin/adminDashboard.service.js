const Model = require('../../models/index');
const { notArchivedFilter, ARCHIVED_STATUS } = require('../../common/agencyVisibility');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n) => String(n).padStart(2, '0');

const dateKeyUTC = (d) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

const startOfUtcDay = (d) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const startOfUtcMonth = (offset = 0) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
};

const startOfUtcWeek = (date = new Date()) => {
  const d = startOfUtcDay(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
};

const addUtcDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const money = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const compactMoney = (value) => {
  const num = Number(value) || 0;
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (Math.abs(num) >= 10_000) return `$${(num / 1000).toFixed(1)}K`;
  return money(num);
};

const initials = (name = '') =>
  String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || 'AG';

const monthlyFromPlan = (plan) => {
  if (!plan) return 0;
  const price = Number(plan.price) || 0;
  return plan.billingCycle === 'yearly' ? price / 12 : price;
};

const countMap = (rows) => {
  const map = new Map();
  rows.forEach((row) => map.set(String(row._id), row.n || row.total || 0));
  return map;
};

const pctChange = (current, previous) => {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (!prev && !cur) return { sub: 'No change vs last month', up: true };
  if (!prev) return { sub: `+${cur} vs last month`, up: true };
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { sub: `${pct >= 0 ? '+' : ''}${pct}% vs last month`, up: pct >= 0 };
};

const complianceForStatus = (status) => {
  if (status === 'Active') return 98;
  if (status === 'Pending') return 72;
  if (status === 'Inactive') return 54;
  if (status === 'Suspended') return 31;
  return 0;
};

const buildWeeks = (count = 8) => {
  const thisWeek = startOfUtcWeek();
  const weeks = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const from = addUtcDays(thisWeek, -7 * i);
    const to = addUtcDays(from, 6);
    weeks.push({
      from,
      to: addUtcDays(to, 1),
      fromKey: dateKeyUTC(from),
      toKey: dateKeyUTC(to),
      label: `${MONTHS[from.getUTCMonth()]} ${from.getUTCDate()}`,
    });
  }
  return weeks;
};

const buildDays = (count = 14) => {
  const today = startOfUtcDay(new Date());
  const days = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = addUtcDays(today, -i);
    const next = addUtcDays(d, 1);
    days.push({ from: d, to: next, key: dateKeyUTC(d) });
  }
  return days;
};

const getDashboard = async () => {
  const visible = notArchivedFilter();
  const monthStart = startOfUtcMonth(0);
  const nextMonth = startOfUtcMonth(1);
  const prevMonth = startOfUtcMonth(-1);
  const monthStartKey = dateKeyUTC(monthStart);
  const nextMonthKey = dateKeyUTC(nextMonth);
  const prevMonthKey = dateKeyUTC(prevMonth);
  const weeks = buildWeeks(8);
  const days = buildDays(14);
  const seriesFrom = weeks[0].from;
  const seriesFromKey = weeks[0].fromKey;
  const now = new Date();

  const [
    agencies,
    plans,
    invitationCounts,
    clientCounts,
    caregiverCounts,
    userCounts,
    visitMonthCounts,
    visitPrevMonthCounts,
    missedVisits,
    pendingEnrollments,
    newLeadsThisMonth,
    newLeadsLastMonth,
    subInvoices,
    unpaidClientInvoices,
    paidClientThisMonth,
    recentAccounts,
    weekVisits,
    weekSubInvoices,
    daySubInvoices,
    agencyCreatedByWeek,
  ] = await Promise.all([
    Model.AgencyModel.find(visible)
      .populate('subscriptionPlanId')
      .sort({ createdAt: -1 })
      .lean(),
    Model.SubscriptionPlanModel.find().select('name price billingCycle status').lean(),
    Model.InvitationModel.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Promise.all([
      Model.ClientModel.countDocuments(),
      Model.ClientModel.countDocuments({ createdAt: { $gte: monthStart, $lt: nextMonth } }),
      Model.ClientModel.countDocuments({ createdAt: { $gte: prevMonth, $lt: monthStart } }),
    ]),
    Promise.all([
      Model.AgencyAccountModel.countDocuments({ role: 'CAREGIVER' }),
      Model.AgencyAccountModel.countDocuments({ role: 'CAREGIVER', status: 'Active' }),
      Model.AgencyAccountModel.countDocuments({
        role: 'CAREGIVER',
        createdAt: { $gte: monthStart, $lt: nextMonth },
      }),
      Model.AgencyAccountModel.countDocuments({
        role: 'CAREGIVER',
        createdAt: { $gte: prevMonth, $lt: monthStart },
      }),
    ]),
    Promise.all([
      Model.AgencyAccountModel.countDocuments({ status: 'Active' }),
      Model.AgencyAccountModel.countDocuments({
        createdAt: { $gte: monthStart, $lt: nextMonth },
      }),
      Model.AgencyAccountModel.countDocuments({
        createdAt: { $gte: prevMonth, $lt: monthStart },
      }),
      Model.AdminModel.countDocuments({ status: 'Active' }),
    ]),
    Model.VisitModel.countDocuments({
      scheduledDate: { $gte: monthStartKey, $lt: nextMonthKey },
      status: { $in: ['Completed', 'Exception'] },
    }),
    Model.VisitModel.countDocuments({
      scheduledDate: { $gte: prevMonthKey, $lt: monthStartKey },
      status: { $in: ['Completed', 'Exception'] },
    }),
    Model.VisitModel.countDocuments({ status: 'Missed' }),
    Model.EvvEnrollmentModel.countDocuments({ status: { $in: ['Pending', 'Submitted'] } }),
    Model.LeadModel.countDocuments({ createdAt: { $gte: monthStart, $lt: nextMonth } }),
    Model.LeadModel.countDocuments({ createdAt: { $gte: prevMonth, $lt: monthStart } }),
    Model.AgencySubscriptionInvoiceModel.find({
      $or: [
        { paidAt: { $gte: prevMonth } },
        { invoiceDate: { $gte: prevMonth } },
        { status: { $in: ['Pending', 'Overdue'] } },
      ],
    })
      .select('agencyId total status paidAt invoiceDate')
      .lean(),
    Model.ClientInvoiceModel.aggregate([
      { $match: { status: 'Sent' } },
      { $group: { _id: null, total: { $sum: '$total' }, n: { $sum: 1 } } },
    ]),
    Model.ClientInvoiceModel.aggregate([
      { $match: { status: 'Paid', paidAt: { $gte: monthStart, $lt: nextMonth } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    Model.AgencyAccountModel.find()
      .select('fullName email role status createdAt agencyId')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
    Model.VisitModel.aggregate([
      {
        $match: {
          scheduledDate: { $gte: seriesFromKey },
          status: { $in: ['Completed', 'Exception'] },
        },
      },
      { $group: { _id: '$scheduledDate', n: { $sum: 1 } } },
    ]),
    Model.AgencySubscriptionInvoiceModel.aggregate([
      {
        $match: {
          status: 'Paid',
          $or: [{ paidAt: { $gte: seriesFrom } }, { invoiceDate: { $gte: seriesFrom } }],
        },
      },
      {
        $project: {
          total: 1,
          at: { $ifNull: ['$paidAt', '$invoiceDate'] },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$at' } },
          total: { $sum: '$total' },
        },
      },
    ]),
    Model.AgencySubscriptionInvoiceModel.aggregate([
      {
        $match: {
          status: 'Paid',
          $or: [{ paidAt: { $gte: days[0].from } }, { invoiceDate: { $gte: days[0].from } }],
        },
      },
      {
        $project: {
          total: 1,
          at: { $ifNull: ['$paidAt', '$invoiceDate'] },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$at' } },
          total: { $sum: '$total' },
        },
      },
    ]),
    Model.AgencyModel.aggregate([
      { $match: { createdAt: { $lte: now }, status: { $ne: ARCHIVED_STATUS } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          n: { $sum: 1 },
        },
      },
    ]),
  ]);

  const agencyIds = agencies.map((a) => a._id);
  const [clientsByAgency, caregiversByAgency, visitsByAgency] = agencyIds.length
    ? await Promise.all([
        Model.ClientModel.aggregate([
          { $match: { agencyId: { $in: agencyIds } } },
          { $group: { _id: '$agencyId', n: { $sum: 1 } } },
        ]),
        Model.AgencyAccountModel.aggregate([
          { $match: { agencyId: { $in: agencyIds }, role: 'CAREGIVER', status: 'Active' } },
          { $group: { _id: '$agencyId', n: { $sum: 1 } } },
        ]),
        Model.VisitModel.aggregate([
          { $match: { agencyId: { $in: agencyIds }, scheduledDate: { $gte: monthStartKey, $lt: nextMonthKey } } },
          { $group: { _id: { agencyId: '$agencyId', status: '$status' }, n: { $sum: 1 } } },
        ]),
      ])
    : [[], [], []];

  const clientByAgency = countMap(clientsByAgency);
  const caregiverByAgency = countMap(caregiversByAgency);
  const visitStatsByAgency = new Map();
  visitsByAgency.forEach((row) => {
    const id = String(row._id.agencyId);
    if (!visitStatsByAgency.has(id)) visitStatsByAgency.set(id, { total: 0, done: 0 });
    const rec = visitStatsByAgency.get(id);
    rec.total += row.n;
    if (['Completed', 'Exception'].includes(row._id.status)) rec.done += row.n;
  });

  const inviteMap = countMap(invitationCounts);
  const pendingInvites = inviteMap.get('Pending') || 0;
  const [clientsTotal, clientsThisMonth, clientsLastMonth] = clientCounts;
  const [caregiversTotal, caregiversActive, caregiversThisMonth, caregiversLastMonth] = caregiverCounts;
  const [activeUsers, usersThisMonth, usersLastMonth, activeAdmins] = userCounts;
  const unpaidClient = unpaidClientInvoices[0] || { total: 0, n: 0 };
  const collectedThisMonth = Number(paidClientThisMonth[0]?.total) || 0;

  const pendingAgencies = agencies.filter((a) => a.status === 'Pending');
  const suspendedAgencies = agencies.filter((a) => a.status === 'Suspended');
  const activeAgencies = agencies.filter((a) => a.status === 'Active');
  const newThisMonth = agencies.filter((a) => a.createdAt && a.createdAt >= monthStart && a.createdAt < nextMonth);
  const newLastMonth = agencies.filter((a) => a.createdAt && a.createdAt >= prevMonth && a.createdAt < monthStart);

  const paidThisMonth = subInvoices
    .filter((inv) => inv.status === 'Paid' && ((inv.paidAt || inv.invoiceDate) >= monthStart) && ((inv.paidAt || inv.invoiceDate) < nextMonth))
    .reduce((s, inv) => s + (Number(inv.total) || 0), 0);
  const paidLastMonth = subInvoices
    .filter((inv) => inv.status === 'Paid' && ((inv.paidAt || inv.invoiceDate) >= prevMonth) && ((inv.paidAt || inv.invoiceDate) < monthStart))
    .reduce((s, inv) => s + (Number(inv.total) || 0), 0);
  const unpaidSubs = subInvoices
    .filter((inv) => ['Pending', 'Overdue'].includes(inv.status))
    .reduce((s, inv) => s + (Number(inv.total) || 0), 0);
  const overdueCount = subInvoices.filter((inv) => inv.status === 'Overdue').length;

  const mrr = activeAgencies.reduce((s, a) => s + monthlyFromPlan(a.subscriptionPlanId), 0);
  const monthlyRevenue = paidThisMonth || mrr;
  const revenueTrend = pctChange(paidThisMonth || mrr, paidLastMonth || 0);

  const paidByAgencyThisMonth = new Map();
  subInvoices.forEach((inv) => {
    if (inv.status !== 'Paid') return;
    const at = inv.paidAt || inv.invoiceDate;
    if (!at || at < monthStart || at >= nextMonth) return;
    const id = String(inv.agencyId);
    paidByAgencyThisMonth.set(id, (paidByAgencyThisMonth.get(id) || 0) + (Number(inv.total) || 0));
  });

  const claimsTrend = pctChange(visitMonthCounts, visitPrevMonthCounts);
  const socialTrend = pctChange(newLeadsThisMonth, newLeadsLastMonth);
  const agencyTrend = newThisMonth.length
    ? { sub: `+${newThisMonth.length} this month`, up: true }
    : { sub: 'No new this month', up: true };
  const userTrend = pctChange(usersThisMonth, usersLastMonth);
  const clientTrend = clientsThisMonth
    ? { sub: `+${clientsThisMonth} this month`, up: true }
    : { sub: 'Across all agencies', up: true };
  const caregiverTrend = caregiversThisMonth
    ? { sub: `+${caregiversThisMonth} this month`, up: true }
    : { sub: `${caregiversActive} active`, up: true };

  const visitsByDay = new Map(weekVisits.map((row) => [row._id, row.n]));
  const revenueByDay = new Map(weekSubInvoices.map((row) => [row._id, row.total]));
  const createdByDay = new Map(agencyCreatedByWeek.map((row) => [row._id, row.n]));
  const sparkByDay = new Map(daySubInvoices.map((row) => [row._id, row.total]));

  let cumulativeAgencies = agencies.filter((a) => a.createdAt && a.createdAt < seriesFrom).length;
  const series = weeks.map((week) => {
    let weekRevenue = 0;
    let weekClaims = 0;
    let weekNew = 0;
    for (let d = new Date(week.from); d < week.to; d = addUtcDays(d, 1)) {
      const key = dateKeyUTC(d);
      weekRevenue += Number(revenueByDay.get(key)) || 0;
      weekClaims += Number(visitsByDay.get(key)) || 0;
      weekNew += Number(createdByDay.get(key)) || 0;
    }
    cumulativeAgencies += weekNew;
    return {
      label: week.label,
      revenue: Math.round(weekRevenue),
      agencies: cumulativeAgencies,
      claims: weekClaims,
    };
  });

  const sparkline = days.map((day) => Math.round(Number(sparkByDay.get(day.key)) || 0));

  const topAgencies = agencies
    .map((agency) => {
      const id = String(agency._id);
      const plan = agency.subscriptionPlanId;
      const visitRec = visitStatsByAgency.get(id);
      const compliance = visitRec?.total
        ? Math.round((visitRec.done / visitRec.total) * 100)
        : complianceForStatus(agency.status);
      const revenue = paidByAgencyThisMonth.get(id) || (agency.status === 'Active' ? monthlyFromPlan(plan) : 0);
      return {
        id,
        name: agency.name,
        location: [agency.city, agency.state].filter(Boolean).join(', ') || '—',
        clients: clientByAgency.get(id) || 0,
        caregivers: caregiverByAgency.get(id) || 0,
        revenue: Math.round(revenue),
        plan: plan?.name || 'Unassigned',
        compliance,
        status: agency.status === 'Suspended' ? 'Warning' : agency.status,
        initials: initials(agency.name),
        iconColor: agency.iconColor || 'bg-blue-100 text-blue-600',
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  const health = [
    { label: 'Uptime', value: formatUptime(process.uptime()), status: 'Healthy' },
    { label: 'API Health', value: 'Online', status: 'Healthy' },
    {
      label: 'Billing System Sync',
      value: overdueCount ? `${overdueCount} overdue` : 'Synced',
      status: overdueCount ? 'Warning' : 'Healthy',
    },
    { label: 'Database', value: 'Connected', status: 'Healthy' },
    {
      label: 'Compliance Monitoring',
      value: suspendedAgencies.length || missedVisits
        ? `${suspendedAgencies.length + (missedVisits ? 1 : 0)} alert${suspendedAgencies.length + (missedVisits ? 1 : 0) === 1 ? '' : 's'}`
        : 'Clear',
      status: suspendedAgencies.length || missedVisits ? 'Warning' : 'Healthy',
    },
  ];

  const insights = [];
  if (pendingAgencies.length) {
    insights.push({
      id: 'pending',
      tone: 'amber',
      title: 'Agencies awaiting approval',
      text: `${pendingAgencies.length} agenc${pendingAgencies.length === 1 ? 'y is' : 'ies are'} pending activation.`,
    });
  }
  if (mrr > 0) {
    insights.push({
      id: 'revenue',
      tone: 'emerald',
      title: 'Recurring revenue',
      text: `Active subscriptions are generating ${compactMoney(mrr)} MRR.`,
    });
  }
  if (missedVisits) {
    insights.push({
      id: 'missed',
      tone: 'amber',
      title: 'Missed visits need review',
      text: `${missedVisits} missed visit${missedVisits === 1 ? '' : 's'} across the platform.`,
    });
  }
  if (unpaidSubs > 0) {
    insights.push({
      id: 'unpaid',
      tone: 'blue',
      title: 'Outstanding subscriptions',
      text: `${compactMoney(unpaidSubs)} in pending or overdue agency invoices.`,
    });
  }
  if (!insights.length) {
    insights.push({
      id: 'ready',
      tone: 'blue',
      title: 'Platform ready',
      text: 'No outstanding activation or billing issues detected.',
    });
  }

  const alerts = [];
  pendingAgencies.forEach((a) => {
    alerts.push({
      id: `pend-${a._id}`,
      title: `${a.name} awaiting approval`,
      time: relativeTime(a.createdAt),
      tone: 'warning',
    });
  });
  suspendedAgencies.forEach((a) => {
    alerts.push({
      id: `sus-${a._id}`,
      title: `${a.name} is suspended`,
      time: 'Action needed',
      tone: 'danger',
    });
  });
  if (overdueCount) {
    alerts.push({
      id: 'overdue-invoices',
      title: `${overdueCount} overdue subscription invoice${overdueCount === 1 ? '' : 's'}`,
      time: 'Billing',
      tone: 'danger',
    });
  }
  if (missedVisits) {
    alerts.push({
      id: 'missed-visits',
      title: `${missedVisits} missed visit${missedVisits === 1 ? '' : 's'} platform-wide`,
      time: 'EVV',
      tone: 'warning',
    });
  }

  const tasks = [
    { id: 'approve', label: 'Agencies awaiting approval', count: pendingAgencies.length, to: '/admin/agencies' },
    { id: 'invites', label: 'Open invitations', count: pendingInvites, to: '/admin/invitations' },
    { id: 'unpaid', label: 'Unpaid subscription invoices', count: subInvoices.filter((i) => ['Pending', 'Overdue'].includes(i.status)).length, to: '/admin/billing-claims' },
    { id: 'missed', label: 'Missed visits', count: missedVisits, to: '/admin/evv-compliance' },
    { id: 'enroll', label: 'Pending EVV enrollments', count: pendingEnrollments, to: '/admin/evv-compliance' },
    { id: 'plans', label: 'Active subscription plans', count: plans.filter((p) => p.status === 'Active').length, to: '/admin/subscription-plans' },
  ];

  const agencyNameById = new Map(agencies.map((a) => [String(a._id), a.name]));
  const roleLabel = {
    AGENCY_OWNER: 'Agency Owner',
    HR: 'HR Staff',
    CAREGIVER: 'Caregiver',
    CLIENT: 'Client',
  };
  const recentActivity = recentAccounts.map((row) => ({
    id: String(row._id),
    name: row.fullName || row.email,
    role: roleLabel[row.role] || row.role,
    detail: agencyNameById.get(String(row.agencyId)) || row.status || 'Account created',
    time: row.createdAt,
    initials: initials(row.fullName || row.email),
  }));

  return {
    kpis: {
      agencies: { value: agencies.length, ...agencyTrend },
      users: {
        value: activeUsers + activeAdmins,
        sub: `${activeAgencies.length} active agencies`,
        up: userTrend.up,
      },
      clients: { value: clientsTotal, ...clientTrend },
      caregivers: { value: caregiversActive, ...caregiverTrend },
      revenue: {
        value: monthlyRevenue,
        display: compactMoney(monthlyRevenue),
        sub: paidThisMonth ? revenueTrend.sub : 'MRR from active plans',
        up: revenueTrend.up,
      },
      claims: {
        value: visitMonthCounts,
        sub: 'Completed visits this month',
        up: claimsTrend.up,
      },
      tickets: { value: 0, sub: 'No support tickets yet', up: false },
      social: {
        value: newLeadsThisMonth,
        sub: 'New leads this month',
        up: socialTrend.up,
      },
    },
    series,
    sparkline,
    topAgencies,
    health,
    insights,
    alerts,
    tasks,
    recentActivity,
    finance: {
      mrr: compactMoney(mrr),
      unpaid: compactMoney(unpaidSubs + (Number(unpaidClient.total) || 0)),
      payouts: compactMoney(paidThisMonth),
      collections: compactMoney(collectedThisMonth),
      refunds: compactMoney(0),
    },
    social: {
      pendingPosts: pendingAgencies.length,
      newReviews: 0,
      unreadMessages: newLeadsThisMonth,
      communities: [],
      topics: [],
    },
    members: {
      newSignups: usersThisMonth,
      pending: pendingAgencies.length,
      invites: pendingInvites,
    },
    tickets: [],
    invitationStats: {
      total: [...inviteMap.values()].reduce((s, n) => s + n, 0),
      pending: pendingInvites,
      accepted: inviteMap.get('Accepted') || 0,
      expired: inviteMap.get('Expired') || 0,
    },
  };
};

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${Math.max(1, mins)}m`;
}

function relativeTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

module.exports = { getDashboard };

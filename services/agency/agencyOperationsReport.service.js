const Model = require('../../models');

const OVERTIME_HOURS = 40;

const CATALOG = [
  { key: 'active-clients', group: 'Clients', title: 'Active Clients', description: 'Current clients receiving services' },
  { key: 'new-admissions', group: 'Clients', title: 'New Client Admissions', description: 'New clients admitted during a selected period', needsRange: true },
  { key: 'no-future-schedules', group: 'Clients', title: 'Clients with No Future Schedules', description: 'Clients who may have a gap in upcoming care' },
  { key: 'inquiries', group: 'Clients', title: 'Inquiry Report', description: 'Leads and inquiries in the selected period', needsRange: true },
  { key: 'birthdays', group: 'Clients', title: 'Client Birthday Report', description: 'Client birthdays in the selected month', needsMonth: true },
  { key: 'caregiver-compliance', group: 'Caregivers', title: 'Caregiver Compliance', description: 'Missing or incomplete caregiver documents' },
  { key: 'caregiver-expiration', group: 'Caregivers', title: 'Caregiver Expiration', description: 'Expiring certifications and documents' },
  { key: 'caregiver-availability', group: 'Caregivers', title: 'Caregiver Availability', description: 'Caregivers available for new shifts' },
  { key: 'caregiver-overtime', group: 'Caregivers', title: 'Caregiver Overtime', description: 'Overtime hours and potential extra payroll costs', needsRange: true },
  { key: 'missed-visits', group: 'Visits', title: 'Missed Visits', description: 'Visits that were not completed', needsRange: true },
  { key: 'late-clock-in', group: 'Visits', title: 'Late Clock-In', description: 'Caregivers arriving late', needsRange: true },
  { key: 'scheduled-vs-actual', group: 'Visits', title: 'Scheduled vs Actual Hours', description: 'Difference between planned and delivered care', needsRange: true },
  { key: 'outstanding-invoices', group: 'Billing', title: 'Outstanding Invoices', description: 'Invoices that have not been paid' },
  { key: 'revenue-by-month', group: 'Billing', title: 'Revenue by Month', description: 'Monthly agency revenue', needsRange: true },
  { key: 'gross-margin', group: 'Billing', title: 'Gross Margin by Client', description: 'Revenue compared with direct caregiver costs', needsRange: true },
  { key: 'performance-summary', group: 'Agency', title: 'Agency Performance Summary', description: 'Overall operational and business performance', needsRange: true },
  { key: 'agency-activity', group: 'Agency', title: 'Agency Activity', description: 'Important agency activities', needsRange: true },
];

function todayString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function rangeFromQuery(query = {}) {
  const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to || '') ? query.to : todayString();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from || '') ? query.from : addDays(to, -30);
  return { from, to };
}

function clientName(client) {
  return [client.firstName, client.lastName].filter(Boolean).join(' ').trim() || 'Client';
}

function hoursBetween(start, end) {
  if (!start || !end) return 0;
  const ms = new Date(end) - new Date(start);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round((ms / 36e5) * 100) / 100;
}

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(columns, rows) {
  const header = columns.map((column) => csvEscape(column.label)).join(',');
  const body = rows.map((row) => columns.map((column) => csvEscape(row[column.key])).join(','));
  return [header, ...body].join('\n');
}

async function activeClients(agencyId) {
  const clients = await Model.ClientModel.find({ agencyId, status: 'Active' })
    .select('clientCode firstName lastName phone email admissionDate carePlanStartDate city')
    .sort({ lastName: 1, firstName: 1 })
    .lean();
  return {
    columns: [
      { key: 'code', label: 'Client' },
      { key: 'name', label: 'Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'city', label: 'City' },
      { key: 'admitted', label: 'Admitted' },
    ],
    rows: clients.map((client) => ({
      code: client.clientCode,
      name: clientName(client),
      phone: client.phone || '',
      city: client.city || '',
      admitted: client.admissionDate || client.carePlanStartDate || '',
    })),
  };
}

async function newAdmissions(agencyId, from, to) {
  const clients = await Model.ClientModel.find({ agencyId }).select('clientCode firstName lastName phone admissionDate createdAt status').lean();
  const rows = clients
    .filter((client) => {
      const admitted = client.admissionDate || todayString(client.createdAt);
      return admitted >= from && admitted <= to;
    })
    .map((client) => ({
      code: client.clientCode,
      name: clientName(client),
      phone: client.phone || '',
      admitted: client.admissionDate || todayString(client.createdAt),
      status: client.status,
    }));
  return {
    columns: [
      { key: 'code', label: 'Client' },
      { key: 'name', label: 'Name' },
      { key: 'admitted', label: 'Admitted' },
      { key: 'status', label: 'Status' },
      { key: 'phone', label: 'Phone' },
    ],
    rows,
  };
}

async function noFutureSchedules(agencyId) {
  const today = todayString();
  const [clients, future] = await Promise.all([
    Model.ClientModel.find({ agencyId, status: 'Active' }).select('clientCode firstName lastName phone').lean(),
    Model.VisitModel.distinct('clientId', {
      agencyId,
      scheduledDate: { $gte: today },
      status: { $in: ['Scheduled', 'InProgress'] },
    }),
  ]);
  const scheduled = new Set(future.map(String));
  const rows = clients
    .filter((client) => !scheduled.has(String(client._id)))
    .map((client) => ({
      code: client.clientCode,
      name: clientName(client),
      phone: client.phone || '',
      note: 'No upcoming visit',
    }));
  return {
    columns: [
      { key: 'code', label: 'Client' },
      { key: 'name', label: 'Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'note', label: 'Gap' },
    ],
    rows,
  };
}

async function inquiries(agencyId, from, to) {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T23:59:59.999Z`);
  const leads = await Model.LeadModel.find({ agencyId, createdAt: { $gte: start, $lte: end } })
    .select('leadCode fullName phone email stage leadSource clientId createdAt')
    .sort({ createdAt: -1 })
    .lean();
  return {
    columns: [
      { key: 'code', label: 'Inquiry' },
      { key: 'name', label: 'Name' },
      { key: 'source', label: 'Source' },
      { key: 'stage', label: 'Stage' },
      { key: 'phone', label: 'Phone' },
      { key: 'opened', label: 'Opened' },
    ],
    rows: leads.map((lead) => ({
      code: lead.leadCode,
      name: lead.fullName || '',
      source: lead.leadSource || '',
      stage: lead.clientId ? 'Converted' : lead.stage,
      phone: lead.phone || '',
      opened: todayString(lead.createdAt),
    })),
  };
}

async function birthdays(agencyId, query) {
  const month = /^\d{2}$/.test(query.month || '') ? query.month : todayString().slice(5, 7);
  const clients = await Model.ClientModel.find({ agencyId, status: { $ne: 'Inactive' } })
    .select('clientCode firstName lastName dateOfBirth phone')
    .lean();
  const rows = clients
    .filter((client) => {
      const dob = String(client.dateOfBirth || '');
      const match = dob.match(/(?:^|\/|-)(\d{2})(?:\/|-)/) || dob.match(/^\d{4}-(\d{2})-/);
      return match && match[1] === month;
    })
    .map((client) => ({
      code: client.clientCode,
      name: clientName(client),
      birthday: client.dateOfBirth,
      phone: client.phone || '',
    }));
  return {
    columns: [
      { key: 'code', label: 'Client' },
      { key: 'name', label: 'Name' },
      { key: 'birthday', label: 'Birthday' },
      { key: 'phone', label: 'Phone' },
    ],
    rows,
    note: `Birthdays in month ${month}.`,
  };
}

async function caregiverCompliance(agencyId) {
  const [caregivers, submissions] = await Promise.all([
    Model.AgencyAccountModel.find({ agencyId, role: 'CAREGIVER', status: { $ne: 'Inactive' } })
      .select('fullName employeeId candidateId email')
      .lean(),
    Model.CandidateFormSubmissionModel.find({ agencyId, status: { $in: ['NotStarted', 'Draft'] } })
      .select('documentName status applicationId')
      .lean(),
  ]);
  const candidates = await Model.CandidateModel.find({
    agencyId,
    caregiverAccountId: { $in: caregivers.map((item) => item._id) },
  }).select('caregiverAccountId resumePath').lean();
  const resumeByAccount = new Map(candidates.map((item) => [String(item.caregiverAccountId), item.resumePath]));
  const openDocs = submissions.length;
  const rows = caregivers
    .filter((caregiver) => !resumeByAccount.get(String(caregiver._id)))
    .map((caregiver) => ({
      name: caregiver.fullName,
      employeeId: caregiver.employeeId || '',
      missing: 'Resume or hiring file',
      openForms: openDocs ? `${openDocs} hiring forms still incomplete in the agency` : '',
    }));
  if (!rows.length && openDocs) {
    rows.push({
      name: 'Hiring forms',
      employeeId: '',
      missing: `${openDocs} required forms are not submitted`,
      openForms: 'Check the hiring pipeline',
    });
  }
  return {
    columns: [
      { key: 'name', label: 'Caregiver' },
      { key: 'employeeId', label: 'Employee ID' },
      { key: 'missing', label: 'Missing' },
      { key: 'openForms', label: 'Note' },
    ],
    rows,
  };
}

async function caregiverExpiration(agencyId) {
  const today = todayString();
  const soon = addDays(today, 60);
  const docs = await Model.AgencyDocumentModel.find({
    agencyId,
    status: { $ne: 'Archived' },
    expiryDate: { $nin: ['', null] },
  }).select('name category expiryDate status').lean();
  const rows = docs
    .filter((doc) => doc.expiryDate <= soon)
    .map((doc) => ({
      name: doc.name,
      category: doc.category,
      expires: doc.expiryDate,
      state: doc.expiryDate < today || doc.status === 'Expired' ? 'Expired' : 'Expiring',
    }));
  return {
    columns: [
      { key: 'name', label: 'Document' },
      { key: 'category', label: 'Category' },
      { key: 'expires', label: 'Expires' },
      { key: 'state', label: 'Status' },
    ],
    rows,
    note: 'Uses documents stored on the agency with an expiry date, including HR files.',
  };
}

async function caregiverAvailability(agencyId) {
  const candidates = await Model.CandidateModel.find({ agencyId, availability: 'Available', caregiverAccountId: { $ne: null } })
    .select('firstName lastName phone caregiverAccountId location')
    .lean();
  const accounts = await Model.AgencyAccountModel.find({
    _id: { $in: candidates.map((item) => item.caregiverAccountId) },
    status: 'Active',
    role: 'CAREGIVER',
  }).select('fullName employeeId').lean();
  const accountById = new Map(accounts.map((item) => [String(item._id), item]));
  const rows = candidates
    .filter((item) => accountById.has(String(item.caregiverAccountId)))
    .map((item) => ({
      name: accountById.get(String(item.caregiverAccountId)).fullName,
      employeeId: accountById.get(String(item.caregiverAccountId)).employeeId || '',
      location: item.location || '',
      phone: item.phone || '',
      availability: 'Available',
    }));
  return {
    columns: [
      { key: 'name', label: 'Caregiver' },
      { key: 'employeeId', label: 'Employee ID' },
      { key: 'location', label: 'Location' },
      { key: 'phone', label: 'Phone' },
      { key: 'availability', label: 'Availability' },
    ],
    rows,
  };
}

async function caregiverOvertime(agencyId, from, to) {
  const visits = await Model.VisitModel.find({
    agencyId,
    scheduledDate: { $gte: from, $lte: to },
    status: { $in: ['Completed', 'InProgress', 'Late', 'Exception'] },
  }).select('caregiverName caregiverAccountId billableMinutes checkInAt checkOutAt scheduledStartAt scheduledEndAt hourlyRateSnapshot').lean();
  const byCaregiver = new Map();
  visits.forEach((visit) => {
    const key = String(visit.caregiverAccountId);
    const current = byCaregiver.get(key) || { name: visit.caregiverName, hours: 0, rate: visit.hourlyRateSnapshot || 0 };
    const hours = visit.billableMinutes
      ? Math.round((visit.billableMinutes / 60) * 100) / 100
      : hoursBetween(visit.checkInAt || visit.scheduledStartAt, visit.checkOutAt || visit.scheduledEndAt);
    current.hours = Math.round((current.hours + hours) * 100) / 100;
    if (visit.hourlyRateSnapshot) current.rate = visit.hourlyRateSnapshot;
    byCaregiver.set(key, current);
  });
  const rows = [...byCaregiver.values()]
    .filter((item) => item.hours > OVERTIME_HOURS)
    .map((item) => {
      const extra = Math.round((item.hours - OVERTIME_HOURS) * 100) / 100;
      return {
        name: item.name,
        hours: item.hours,
        overtime: extra,
        extraCost: item.rate ? money(extra * item.rate) : 'Pay rate not on file',
      };
    });
  return {
    columns: [
      { key: 'name', label: 'Caregiver' },
      { key: 'hours', label: 'Hours' },
      { key: 'overtime', label: `Over ${OVERTIME_HOURS}h` },
      { key: 'extraCost', label: 'Extra cost' },
    ],
    rows,
    note: `Overtime is hours above ${OVERTIME_HOURS} in the selected period. Extra cost uses the visit billing rate when a caregiver pay rate is not stored.`,
  };
}

async function missedVisits(agencyId, from, to) {
  const visits = await Model.VisitModel.find({
    agencyId,
    status: 'Missed',
    scheduledDate: { $gte: from, $lte: to },
  }).select('visitCode clientName caregiverName scheduledDate scheduledStartAt exceptionReason').sort({ scheduledDate: -1 }).lean();
  return {
    columns: [
      { key: 'code', label: 'Visit' },
      { key: 'date', label: 'Date' },
      { key: 'client', label: 'Client' },
      { key: 'caregiver', label: 'Caregiver' },
      { key: 'reason', label: 'Reason' },
    ],
    rows: visits.map((visit) => ({
      code: visit.visitCode,
      date: visit.scheduledDate,
      client: visit.clientName,
      caregiver: visit.caregiverName,
      reason: visit.exceptionReason || 'Not completed',
    })),
  };
}

async function lateClockIn(agencyId, from, to) {
  const visits = await Model.VisitModel.find({
    agencyId,
    scheduledDate: { $gte: from, $lte: to },
    $or: [{ lateCheckIn: true }, { status: 'Late' }],
  }).select('visitCode clientName caregiverName scheduledDate scheduledStartAt checkInAt').sort({ scheduledDate: -1 }).lean();
  return {
    columns: [
      { key: 'code', label: 'Visit' },
      { key: 'date', label: 'Date' },
      { key: 'client', label: 'Client' },
      { key: 'caregiver', label: 'Caregiver' },
      { key: 'scheduled', label: 'Scheduled' },
      { key: 'arrived', label: 'Clock-in' },
    ],
    rows: visits.map((visit) => ({
      code: visit.visitCode,
      date: visit.scheduledDate,
      client: visit.clientName,
      caregiver: visit.caregiverName,
      scheduled: visit.scheduledStartAt ? new Date(visit.scheduledStartAt).toLocaleString() : '',
      arrived: visit.checkInAt ? new Date(visit.checkInAt).toLocaleString() : 'Not clocked in',
    })),
  };
}

async function scheduledVsActual(agencyId, from, to) {
  const visits = await Model.VisitModel.find({
    agencyId,
    scheduledDate: { $gte: from, $lte: to },
    status: { $in: ['Completed', 'Late', 'Exception'] },
    checkInAt: { $ne: null },
    checkOutAt: { $ne: null },
  }).select('visitCode clientName caregiverName scheduledDate scheduledStartAt scheduledEndAt checkInAt checkOutAt').sort({ scheduledDate: -1 }).limit(500).lean();
  return {
    columns: [
      { key: 'code', label: 'Visit' },
      { key: 'date', label: 'Date' },
      { key: 'client', label: 'Client' },
      { key: 'caregiver', label: 'Caregiver' },
      { key: 'planned', label: 'Planned hours' },
      { key: 'actual', label: 'Actual hours' },
      { key: 'difference', label: 'Difference' },
    ],
    rows: visits.map((visit) => {
      const planned = hoursBetween(visit.scheduledStartAt, visit.scheduledEndAt);
      const actual = hoursBetween(visit.checkInAt, visit.checkOutAt);
      return {
        code: visit.visitCode,
        date: visit.scheduledDate,
        client: visit.clientName,
        caregiver: visit.caregiverName,
        planned,
        actual,
        difference: Math.round((actual - planned) * 100) / 100,
      };
    }),
  };
}

async function outstandingInvoices(agencyId) {
  const invoices = await Model.ClientInvoiceModel.find({ agencyId, status: { $in: ['Draft', 'Sent'] } })
    .select('invoiceCode clientName status total dueDate periodFrom periodTo')
    .sort({ dueDate: 1 })
    .lean();
  return {
    columns: [
      { key: 'code', label: 'Invoice' },
      { key: 'client', label: 'Client' },
      { key: 'period', label: 'Period' },
      { key: 'status', label: 'Status' },
      { key: 'total', label: 'Amount' },
      { key: 'due', label: 'Due' },
    ],
    rows: invoices.map((invoice) => ({
      code: invoice.invoiceCode,
      client: invoice.clientName,
      period: `${invoice.periodFrom} to ${invoice.periodTo}`,
      status: invoice.status,
      total: money(invoice.total),
      due: invoice.dueDate ? todayString(invoice.dueDate) : '',
    })),
  };
}

async function revenueByMonth(agencyId, from, to) {
  const invoices = await Model.ClientInvoiceModel.find({
    agencyId,
    status: 'Paid',
    periodFrom: { $lte: to },
    periodTo: { $gte: from },
  }).select('total periodFrom paidAt').lean();
  const months = new Map();
  invoices.forEach((invoice) => {
    const month = (invoice.paidAt ? todayString(invoice.paidAt) : invoice.periodFrom).slice(0, 7);
    months.set(month, money((months.get(month) || 0) + invoice.total));
  });
  const rows = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, total]) => ({ month, total }));
  return {
    columns: [
      { key: 'month', label: 'Month' },
      { key: 'total', label: 'Paid revenue' },
    ],
    rows,
  };
}

async function grossMargin(agencyId, from, to) {
  const [invoices, visits] = await Promise.all([
    Model.ClientInvoiceModel.find({
      agencyId,
      status: { $in: ['Sent', 'Paid'] },
      periodFrom: { $lte: to },
      periodTo: { $gte: from },
    }).select('clientName total').lean(),
    Model.VisitModel.find({
      agencyId,
      scheduledDate: { $gte: from, $lte: to },
      status: { $in: ['Completed', 'Late', 'Exception'] },
    }).select('clientName billableMinutes hourlyRateSnapshot').lean(),
  ]);
  const byClient = new Map();
  invoices.forEach((invoice) => {
    const current = byClient.get(invoice.clientName) || { client: invoice.clientName, revenue: 0, hours: 0, cost: null };
    current.revenue = money(current.revenue + invoice.total);
    byClient.set(invoice.clientName, current);
  });
  visits.forEach((visit) => {
    const current = byClient.get(visit.clientName) || { client: visit.clientName, revenue: 0, hours: 0, cost: null };
    current.hours = Math.round((current.hours + (visit.billableMinutes || 0) / 60) * 100) / 100;
    byClient.set(visit.clientName, current);
  });
  return {
    columns: [
      { key: 'client', label: 'Client' },
      { key: 'revenue', label: 'Revenue' },
      { key: 'hours', label: 'Caregiver hours' },
      { key: 'cost', label: 'Direct cost' },
      { key: 'margin', label: 'Margin' },
    ],
    rows: [...byClient.values()].map((item) => ({
      client: item.client,
      revenue: item.revenue,
      hours: item.hours,
      cost: 'Pay rate not on file',
      margin: item.revenue,
    })),
    note: 'Margin equals billed revenue until a caregiver pay rate is stored. Hours are the delivered visit time.',
  };
}

async function performanceSummary(agencyId, from, to) {
  const [active, admissions, missed, late, invoices, paid] = await Promise.all([
    Model.ClientModel.countDocuments({ agencyId, status: 'Active' }),
    newAdmissions(agencyId, from, to),
    Model.VisitModel.countDocuments({ agencyId, status: 'Missed', scheduledDate: { $gte: from, $lte: to } }),
    Model.VisitModel.countDocuments({
      agencyId,
      scheduledDate: { $gte: from, $lte: to },
      $or: [{ lateCheckIn: true }, { status: 'Late' }],
    }),
    Model.ClientInvoiceModel.find({ agencyId, status: { $in: ['Draft', 'Sent'] } }).select('total').lean(),
    Model.ClientInvoiceModel.find({ agencyId, status: 'Paid', periodTo: { $gte: from }, periodFrom: { $lte: to } }).select('total').lean(),
  ]);
  const openAmount = money(invoices.reduce((sum, invoice) => sum + invoice.total, 0));
  const revenue = money(paid.reduce((sum, invoice) => sum + invoice.total, 0));
  return {
    columns: [
      { key: 'metric', label: 'Metric' },
      { key: 'value', label: 'Value' },
    ],
    rows: [
      { metric: 'Active clients', value: active },
      { metric: 'New admissions', value: admissions.rows.length },
      { metric: 'Missed visits', value: missed },
      { metric: 'Late clock-ins', value: late },
      { metric: 'Outstanding invoices', value: invoices.length },
      { metric: 'Outstanding amount', value: openAmount },
      { metric: 'Paid revenue', value: revenue },
    ],
  };
}

async function agencyActivity(agencyId, from, to) {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T23:59:59.999Z`);
  const [activities, notices] = await Promise.all([
    Model.CaregiverActivityModel.find({ agencyId, at: { $gte: start, $lte: end } })
      .select('at caregiverName activity action detail')
      .sort({ at: -1 })
      .limit(150)
      .lean(),
    Model.NotificationModel.find({ agencyId, createdAt: { $gte: start, $lte: end } })
      .select('createdAt title body category')
      .sort({ createdAt: -1 })
      .limit(80)
      .lean(),
  ]);
  const rows = [
    ...activities.map((item) => ({
      when: new Date(item.at).toLocaleString(),
      kind: 'Caregiver',
      what: item.activity || item.action || 'Activity',
      detail: item.detail || item.caregiverName || '',
    })),
    ...notices.map((item) => ({
      when: new Date(item.createdAt).toLocaleString(),
      kind: item.category || 'Notice',
      what: item.title,
      detail: item.body || '',
    })),
  ];
  return {
    columns: [
      { key: 'when', label: 'When' },
      { key: 'kind', label: 'Type' },
      { key: 'what', label: 'Activity' },
      { key: 'detail', label: 'Detail' },
    ],
    rows,
  };
}

const RUNNERS = {
  'active-clients': (agencyId) => activeClients(agencyId),
  'new-admissions': (agencyId, from, to) => newAdmissions(agencyId, from, to),
  'no-future-schedules': (agencyId) => noFutureSchedules(agencyId),
  inquiries: (agencyId, from, to) => inquiries(agencyId, from, to),
  birthdays: (agencyId, _from, _to, query) => birthdays(agencyId, query),
  'caregiver-compliance': (agencyId) => caregiverCompliance(agencyId),
  'caregiver-expiration': (agencyId) => caregiverExpiration(agencyId),
  'caregiver-availability': (agencyId) => caregiverAvailability(agencyId),
  'caregiver-overtime': (agencyId, from, to) => caregiverOvertime(agencyId, from, to),
  'missed-visits': (agencyId, from, to) => missedVisits(agencyId, from, to),
  'late-clock-in': (agencyId, from, to) => lateClockIn(agencyId, from, to),
  'scheduled-vs-actual': (agencyId, from, to) => scheduledVsActual(agencyId, from, to),
  'outstanding-invoices': (agencyId) => outstandingInvoices(agencyId),
  'revenue-by-month': (agencyId, from, to) => revenueByMonth(agencyId, from, to),
  'gross-margin': (agencyId, from, to) => grossMargin(agencyId, from, to),
  'performance-summary': (agencyId, from, to) => performanceSummary(agencyId, from, to),
  'agency-activity': (agencyId, from, to) => agencyActivity(agencyId, from, to),
};

async function resolveAgencies(agencyId) {
  if (String(agencyId) === 'all') {
    return Model.AgencyModel.find().select('_id name').sort({ name: 1 }).lean();
  }
  const agency = await Model.AgencyModel.findById(agencyId).select('_id name').lean();
  if (!agency) {
    const error = new Error('Agency not found');
    error.statusCode = 404;
    throw error;
  }
  return [agency];
}

async function runReport(agencyId, key, query) {
  const report = CATALOG.find((item) => item.key === key);
  if (!report) {
    const error = new Error('Report not found');
    error.statusCode = 404;
    throw error;
  }
  if (!RUNNERS[key]) {
    const error = new Error('Report not found');
    error.statusCode = 404;
    throw error;
  }

  const { from, to } = rangeFromQuery(query);
  const agencies = await resolveAgencies(agencyId);
  if (!agencies.length) {
    return {
      ...report,
      from,
      to,
      count: 0,
      columns: [{ key: 'agency', label: 'Agency' }],
      rows: [],
      note: '',
    };
  }

  const multi = agencies.length > 1 || String(agencyId) === 'all';
  let columns = null;
  const rows = [];
  let note = '';

  for (const agency of agencies) {
    const result = await RUNNERS[key](String(agency._id), from, to, query);
    if (!columns) {
      columns = multi
        ? [{ key: 'agency', label: 'Agency' }, ...result.columns]
        : result.columns;
      note = result.note || '';
    }
    result.rows.forEach((row) => {
      rows.push(multi ? { agency: agency.name || String(agency._id), ...row } : row);
    });
  }

  return {
    ...report,
    from,
    to,
    count: rows.length,
    columns: columns || (multi ? [{ key: 'agency', label: 'Agency' }] : []),
    rows,
    note,
  };
}

module.exports = {
  CATALOG,
  listCatalog() {
    return CATALOG;
  },
  runReport,
  exportCsv: async (agencyId, key, query) => {
    const report = await runReport(agencyId, key, query);
    return {
      filename: `${key}.csv`,
      csv: toCsv(report.columns, report.rows),
    };
  },
};

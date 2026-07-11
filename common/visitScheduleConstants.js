const RECURRENCE_TYPES = ['Daily', 'Weekly', 'Monthly'];
const GRACE_MINUTES = [15, 30];
/** Extra time after grace ends when late clock-in is still allowed (then locked). */
const LATE_CHECK_IN_EXTRA_MINUTES = 60;
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SCHEDULE_STATUSES = ['Active', 'Paused', 'Ended'];
const VISIT_STATUSES = [
  'Scheduled',
  'InProgress',
  'Completed',
  'Missed',
  'Late',
  'Cancelled',
  'Exception',
];
const VISIT_APPROVAL_STATUSES = ['None', 'Pending', 'Approved', 'Rejected'];

const WEEK_DAY_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

module.exports = {
  RECURRENCE_TYPES,
  GRACE_MINUTES,
  LATE_CHECK_IN_EXTRA_MINUTES,
  WEEK_DAYS,
  SCHEDULE_STATUSES,
  VISIT_STATUSES,
  VISIT_APPROVAL_STATUSES,
  WEEK_DAY_INDEX,
};

const HOLIDAY_TYPES = ['National', 'Religious', 'Optional', 'Organizational'];
const HOLIDAY_STATUSES = ['Active', 'Inactive'];
const LEAVE_REQUEST_STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled'];
const VISIT_LEAVE_SOURCES = ['', 'holiday', 'request'];

const DEFAULT_LEAVE_TYPES = [
  { key: 'casual', name: 'Casual Leave', days: 12 },
  { key: 'sick', name: 'Sick Leave', days: 6 },
  { key: 'earned', name: 'Earned Leave', days: 15 },
  { key: 'other', name: 'Other Leave', days: 2 },
];

const typeBlocksByDefault = (type) => type !== 'Optional';

module.exports = {
  HOLIDAY_TYPES,
  HOLIDAY_STATUSES,
  LEAVE_REQUEST_STATUSES,
  VISIT_LEAVE_SOURCES,
  DEFAULT_LEAVE_TYPES,
  typeBlocksByDefault,
};

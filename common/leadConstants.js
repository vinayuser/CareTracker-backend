const LEAD_STAGES = [
  'New Lead',
  'Contacted',
  'Assessment Scheduled',
  'Proposal Sent',
  'Converted',
];

const LEAD_PRIORITIES = ['Hot', 'High', 'Medium', 'Low'];

const PREFERRED_CONTACT_METHODS = ['Phone', 'Email', 'SMS', 'WhatsApp', 'In Person'];

const LEAD_SOURCES = [
  'Website Inquiry',
  'Phone Call',
  'Referral',
  'Walk-in',
  'Social Media',
  'Advertisement',
  'Hospital Discharge',
  'Other',
];

const CAMPAIGNS = [
  'Summer Care Campaign',
  'Fall Wellness Outreach',
  'Hospital Partnership',
  'Community Event',
  'None / Organic',
];

const RELATIONSHIPS = [
  'Self',
  'Son – Family Member',
  'Daughter – Family Member',
  'Spouse / Partner',
  'Sibling',
  'Friend',
  'Legal Guardian',
  'Power of Attorney',
  'Case Manager',
  'Other',
];

const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];

const MEDICAL_CONDITION_OPTIONS = [
  'Arthritis',
  'Mild Dementia',
  'High BP',
  'Diabetes',
  'Heart Disease',
  'Stroke History',
  'COPD',
  'Parkinson\'s',
  'Depression',
  'Mobility Issues',
  'Other',
];

const CARE_TYPES = [
  'In-Home Care',
  'Personal Care',
  'Companion Care',
  'Respite Care',
  'Live-in Care',
  'Skilled Nursing Support',
];

const CARE_REQUIRED_FOR = [
  'Self',
  'Parent',
  'Spouse',
  'Relative',
  'Friend',
  'Other',
];

const PRIMARY_NEEDS = [
  'Personal Care',
  'Meal Support',
  'Mobility Assistance',
  'Companionship',
  'Medication Reminders',
  'Transportation',
  'Housekeeping',
  'Bathing / Hygiene',
];

const CARE_SCHEDULES = [
  'Daily',
  '5 Days / Week',
  '3 Days / Week',
  'Weekends Only',
  'As Needed',
  'Live-in',
];

const PREFERRED_TIMES = [
  'Morning (6:00 AM – 12:00 PM)',
  'Afternoon (12:00 PM – 5:00 PM)',
  'Evening (5:00 PM – 9:00 PM)',
  '9:00 AM – 1:00 PM',
  'Flexible',
  'Overnight',
];

const getOptions = () => ({
  stages: LEAD_STAGES,
  priorities: LEAD_PRIORITIES,
  preferred_contact_methods: PREFERRED_CONTACT_METHODS,
  lead_sources: LEAD_SOURCES,
  campaigns: CAMPAIGNS,
  relationships: RELATIONSHIPS,
  genders: GENDERS,
  medical_conditions: MEDICAL_CONDITION_OPTIONS,
  care_types: CARE_TYPES,
  care_required_for: CARE_REQUIRED_FOR,
  primary_needs: PRIMARY_NEEDS,
  care_schedules: CARE_SCHEDULES,
  preferred_times: PREFERRED_TIMES,
});

module.exports = {
  LEAD_STAGES,
  LEAD_PRIORITIES,
  PREFERRED_CONTACT_METHODS,
  LEAD_SOURCES,
  CAMPAIGNS,
  RELATIONSHIPS,
  GENDERS,
  MEDICAL_CONDITION_OPTIONS,
  CARE_TYPES,
  CARE_REQUIRED_FOR,
  PRIMARY_NEEDS,
  CARE_SCHEDULES,
  PREFERRED_TIMES,
  getOptions,
};

const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];

const MARITAL_STATUSES = ['Single', 'Married', 'Divorced', 'Widowed', 'Other'];

const LIVING_ARRANGEMENTS = ['Alone', 'With Spouse', 'With Family', 'Other'];

const HOME_ACCESSIBILITY = ['No Stairs', 'Stairs to Enter', 'Stairs Inside', 'Ramp', 'Elevator'];

const RESIDENCE_TYPES = ['Private Home', 'Apartment', 'Assisted Living', 'Nursing Home', 'Other'];

const ASSISTIVE_DEVICES = ['None', 'Cane', 'Walker', 'Wheelchair', 'Other'];

const SERVICE_TYPES = [
  'Personal Care',
  'Companionship',
  'Homemaking',
  'Medication Reminders',
  'Meal Preparation',
  'Transportation',
  'Skilled Nursing',
  'Other',
];

const CARE_FREQUENCIES = ['Hourly', 'Daily', 'Weekly', 'Monthly', 'Other'];

const PREFERRED_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const PREFERRED_TIMES = ['Morning', 'Afternoon', 'Evening', 'Overnight'];

const PAYMENT_RESPONSIBILITIES = ['Client', 'Family Member', 'Other'];

const PAYMENT_METHODS = [
  'Private Pay',
  'Long Term Care Insurance',
  'Medicaid',
  'VA Benefits',
  'Other',
];

const CLIENT_STATUSES = ['Active', 'Inactive', 'Pending'];

const YES_NO = ['Yes', 'No'];

module.exports = {
  GENDERS,
  MARITAL_STATUSES,
  LIVING_ARRANGEMENTS,
  HOME_ACCESSIBILITY,
  RESIDENCE_TYPES,
  ASSISTIVE_DEVICES,
  SERVICE_TYPES,
  CARE_FREQUENCIES,
  PREFERRED_DAYS,
  PREFERRED_TIMES,
  PAYMENT_RESPONSIBILITIES,
  PAYMENT_METHODS,
  CLIENT_STATUSES,
  YES_NO,
  getOptions: () => ({
    genders: GENDERS,
    maritalStatuses: MARITAL_STATUSES,
    livingArrangements: LIVING_ARRANGEMENTS,
    homeAccessibility: HOME_ACCESSIBILITY,
    residenceTypes: RESIDENCE_TYPES,
    assistiveDevices: ASSISTIVE_DEVICES,
    serviceTypes: SERVICE_TYPES,
    careFrequencies: CARE_FREQUENCIES,
    preferredDays: PREFERRED_DAYS,
    preferredTimes: PREFERRED_TIMES,
    paymentResponsibilities: PAYMENT_RESPONSIBILITIES,
    paymentMethods: PAYMENT_METHODS,
    statuses: CLIENT_STATUSES,
    yesNo: YES_NO,
  }),
};

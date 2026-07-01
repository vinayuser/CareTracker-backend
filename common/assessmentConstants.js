const ASSESSMENT_TYPES = [
  'Initial Assessment',
  'Reassessment',
  'Hospital Discharge',
  'Annual Review',
  'Change in Condition',
];

const ASSESSMENT_STATUSES = ['Enquiry', 'Quoted', 'Accepted', 'Declined'];

const QUOTE_STATUSES = ['Quoted', 'Accepted', 'Declined'];

const GENDERS = ['Male', 'Female', 'Other'];

const MARITAL_STATUSES = ['Single', 'Married', 'Widowed', 'Divorced'];

const CONTACT_METHODS = ['Phone', 'Text', 'Email'];

const INSURANCE_TYPES = ['Medicare', 'Medicaid', 'VA', 'Private Insurance', 'Long Term Care', 'Private Pay'];

const MEDICAL_HISTORY_ITEMS = [
  'Diabetes', 'Stroke', 'Dementia', "Alzheimer's", "Parkinson's", 'COPD', 'CHF', 'Cancer',
  'Arthritis', 'Hypertension', 'Kidney Disease', 'Liver Disease', 'Anxiety', 'Depression',
  'Fall History', 'Seizures', 'Vision Impairment', 'Hearing Impairment',
];

const ALLERGY_TYPES = ['Medication', 'Food', 'Environmental', 'Latex', 'None'];

const ADL_ITEMS = ['Bathing', 'Dressing', 'Grooming', 'Toileting', 'Transfers', 'Walking', 'Feeding', 'Continence'];

const ADL_SCORES = ['0', '1', '2', '3', '4'];

const ADL_SCORE_LABELS = {
  0: 'Independent',
  1: 'Supervision',
  2: 'Limited Assistance',
  3: 'Extensive Assistance',
  4: 'Total Dependence',
};

const IADL_ITEMS = ['Shopping', 'Meal Preparation', 'Laundry', 'Transportation', 'Housekeeping', 'Financial Management'];

const AMBULATION_TYPES = ['Independently', 'Cane', 'Walker', 'Wheelchair', 'Bedbound'];

const TRANSFER_TYPES = ['None', 'One Person', 'Two Person', 'Hoyer Lift'];

const ORIENTATION_LEVELS = ['x1', 'x2', 'x3', 'x4'];

const MEMORY_LEVELS = ['Good', 'Fair', 'Poor'];

const DECISION_LEVELS = ['Independent', 'Needs Assistance'];

const DIET_TYPES = ['Regular', 'Diabetic', 'Low Sodium', 'Renal', 'Pureed', 'Thickened Liquids'];

const HOME_SAFETY_ITEMS = [
  'Smoke Detectors', 'Trip Hazards', 'Fire Extinguisher', 'Emergency Exit Plan',
  'Grab Bars', 'Pets', 'Working Telephone',
];

const CLIENT_GOALS = [
  'Remain at Home', 'Prevent Falls', 'Medication Compliance', 'Increase Mobility',
  'Improve Nutrition', 'Socialization', 'Reduce Hospitalizations',
];

const REQUESTED_SERVICES = [
  'Personal Care', 'Bathing', 'Dressing', 'Grooming', 'Toileting', 'Meal Preparation',
  'Laundry', 'Light Housekeeping', 'Shopping', 'Transportation', 'Medication Reminder',
  'Companionship', 'Dementia Care', 'Respite Care', 'Overnight Care', 'Live-In Care',
];

const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const RISK_LEVELS = ['Low', 'Moderate', 'High'];

const ASSESSMENT_STEPS = [
  { id: 1, label: 'Intake & Medical', description: 'Client info, contacts, medical history, medications' },
  { id: 2, label: 'Functional & Care Plan', description: 'ADLs, mobility, goals, services, schedule, signatures' },
];

const buildEmptyMedicationRow = () => ({
  name: '', dosage: '', frequency: '', purpose: '', selfManaged: false,
});

const buildEmptyAdls = () => Object.fromEntries(ADL_ITEMS.map((item) => [item, '']));

const buildEmptyFormData = () => ({
  clientInfo: {
    clientName: '', dob: '', age: '', gender: '', ssn: '', primaryLanguage: '', religion: '',
    height: '', weight: '', interpreterNeeded: false, maritalStatus: '',
    primaryDiagnosis: '', secondaryDiagnoses: '',
  },
  contactInfo: {
    homeAddress: '', city: '', state: '', zip: '', homePhone: '', mobile: '', email: '',
    preferredContactMethods: [],
  },
  responsibleParty: {
    name: '', relationship: '', phone: '', email: '',
    powerOfAttorney: false, medicalPoa: false, guardian: false,
  },
  physicianInfo: {
    primaryPhysician: '', primaryPhysicianPhone: '', specialists: '',
    preferredHospital: '', pharmacy: '', pharmacyPhone: '',
  },
  insurance: {
    types: [], policyNumber: '', authorizationNumber: '', hoursAuthorized: '', startDate: '',
  },
  emergencyInfo: {
    primaryName: '', primaryRelationship: '', primaryPhone: '',
    backupName: '', backupRelationship: '', backupPhone: '',
  },
  medicalHistory: [],
  allergies: { types: [], details: '' },
  medications: Array.from({ length: 6 }, buildEmptyMedicationRow),
  adls: buildEmptyAdls(),
  adlComments: '',
  iadls: Object.fromEntries(IADL_ITEMS.map((item) => [item, 'Independent'])),
  medicationReminder: 'Not Needed',
  mobility: {
    ambulation: [], transferAssistance: [], fallHistory: false, fallCount: '',
  },
  cognitiveStatus: {
    orientation: '', memory: '', decisionMaking: '', confusion: false, wandering: false,
    behaviorConcerns: '',
  },
  homeSafety: Object.fromEntries(HOME_SAFETY_ITEMS.map((item) => [item, false])),
  nutrition: {
    dietTypes: [], weightLoss: false, mealAssistance: false, fluidRestrictions: false,
  },
  painAssessment: {
    painToday: false, painScore: '', location: '', painMedication: '',
  },
  mentalHealth: {
    depression: false, anxiety: false, behavioralConcerns: '',
  },
  clientGoals: [],
  requestedServices: [],
  schedule: {
    daysNeeded: [], preferredStart: '', preferredEnd: '',
  },
  coordinatorNotes: '',
  carePlanSummary: {
    primaryNeeds: '', recommendedWeeklyHours: '', startOfCareDate: '', riskLevel: '',
  },
  signatures: {
    clientSignature: '', clientDate: '',
    responsiblePartySignature: '', responsiblePartyDate: '',
    coordinatorSignature: '', coordinatorDate: '',
    rnSignature: '', rnDate: '',
  },
});

module.exports = {
  ASSESSMENT_TYPES,
  ASSESSMENT_STATUSES,
  QUOTE_STATUSES,
  GENDERS,
  MARITAL_STATUSES,
  CONTACT_METHODS,
  INSURANCE_TYPES,
  MEDICAL_HISTORY_ITEMS,
  ALLERGY_TYPES,
  ADL_ITEMS,
  ADL_SCORES,
  ADL_SCORE_LABELS,
  IADL_ITEMS,
  AMBULATION_TYPES,
  TRANSFER_TYPES,
  ORIENTATION_LEVELS,
  MEMORY_LEVELS,
  DECISION_LEVELS,
  DIET_TYPES,
  HOME_SAFETY_ITEMS,
  CLIENT_GOALS,
  REQUESTED_SERVICES,
  WEEK_DAYS,
  RISK_LEVELS,
  ASSESSMENT_STEPS,
  buildEmptyMedicationRow,
  buildEmptyAdls,
  buildEmptyFormData,
  getOptions: () => ({
    assessmentTypes: ASSESSMENT_TYPES,
    statuses: ASSESSMENT_STATUSES,
    genders: GENDERS,
    maritalStatuses: MARITAL_STATUSES,
    contactMethods: CONTACT_METHODS,
    insuranceTypes: INSURANCE_TYPES,
    medicalHistoryItems: MEDICAL_HISTORY_ITEMS,
    allergyTypes: ALLERGY_TYPES,
    adlItems: ADL_ITEMS,
    adlScores: ADL_SCORES,
    iadlItems: IADL_ITEMS,
    ambulationTypes: AMBULATION_TYPES,
    transferTypes: TRANSFER_TYPES,
    orientationLevels: ORIENTATION_LEVELS,
    memoryLevels: MEMORY_LEVELS,
    decisionLevels: DECISION_LEVELS,
    dietTypes: DIET_TYPES,
    homeSafetyItems: HOME_SAFETY_ITEMS,
    clientGoals: CLIENT_GOALS,
    requestedServices: REQUESTED_SERVICES,
    weekDays: WEEK_DAYS,
    riskLevels: RISK_LEVELS,
    assessmentSteps: ASSESSMENT_STEPS,
  }),
};

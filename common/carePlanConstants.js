const ASSISTANCE_LEVELS = [
  'Independent',
  'Minimal Assistance',
  'Moderate Assistance',
  'High Need',
  'Full Assistance',
];

const COGNITIVE_LEVELS = [
  'No Impairment',
  'Mild Impairment',
  'Moderate Impairment',
  'Severe Impairment',
];

const COMMUNICATION_LEVELS = [
  'No Difficulty',
  'Mild Difficulty',
  'Moderate Difficulty',
  'Severe Difficulty',
];

const EMOTIONAL_SUPPORT_LEVELS = [
  'No Support Needed',
  'Mild Support Needed',
  'Moderate Support Needed',
  'High Support Needed',
];

const HOME_SAFETY_LEVELS = [
  'Low Risk',
  'Moderate Risk',
  'High Risk',
];

const SERVICE_FREQUENCIES = [
  'Daily',
  'Twice a day',
  '3 times a week',
  'Weekly',
  'As needed',
];

const SERVICE_DURATIONS = [
  '15 mins',
  '20 mins',
  '30 mins',
  '45 mins',
  '1 hour',
  'Variable',
];

const SERVICE_PROVIDERS = [
  'Care Giver',
  'RN',
  'Care Giver / RN',
  'Family',
];

const DEFAULT_SERVICES = [
  {
    enabled: true,
    category: 'Personal Care',
    description: 'Assistance with bathing, grooming, and dressing',
    frequency: 'Daily',
    duration: '30 mins',
    provider: 'Care Giver',
    notes: '',
  },
  {
    enabled: true,
    category: 'Medication Management',
    description: 'Medication reminders and administration support',
    frequency: 'Twice a day',
    duration: '15 mins',
    provider: 'Care Giver / RN',
    notes: '',
  },
  {
    enabled: true,
    category: 'Meal Preparation',
    description: 'Prepare nutritious meals according to dietary needs',
    frequency: 'Daily',
    duration: '45 mins',
    provider: 'Care Giver',
    notes: '',
  },
  {
    enabled: true,
    category: 'Health Monitoring',
    description: 'Monitor vitals and report changes',
    frequency: '3 times a week',
    duration: '20 mins',
    provider: 'RN',
    notes: '',
  },
  {
    enabled: true,
    category: 'Transportation / Errands',
    description: 'Assist with grocery shopping and appointments',
    frequency: 'As needed',
    duration: 'Variable',
    provider: 'Care Giver',
    notes: '',
  },
];

const CARE_OVERVIEW_CATEGORIES = [
  { key: 'personalCare', label: 'Personal Care', icon: 'User' },
  { key: 'healthManagement', label: 'Health Management', icon: 'HeartPulse' },
  { key: 'mealNutrition', label: 'Meal & Nutrition', icon: 'Utensils' },
  { key: 'mobilitySafety', label: 'Mobility & Safety', icon: 'Accessibility' },
  { key: 'companionship', label: 'Companionship & Support', icon: 'Users' },
  { key: 'household', label: 'Household Support', icon: 'Home' },
];

const ASSESSMENT_FIELDS = [
  { key: 'personalCare', label: 'Personal Care', options: ASSISTANCE_LEVELS, default: 'Moderate Assistance' },
  { key: 'mobility', label: 'Mobility', options: ASSISTANCE_LEVELS, default: 'Moderate Assistance' },
  { key: 'medicationManagement', label: 'Medication Management', options: ASSISTANCE_LEVELS, default: 'High Need' },
  { key: 'nutrition', label: 'Nutrition', options: ASSISTANCE_LEVELS, default: 'Moderate Assistance' },
  { key: 'cognitiveStatus', label: 'Cognitive Status', options: COGNITIVE_LEVELS, default: 'Mild Impairment' },
  { key: 'communication', label: 'Communication', options: COMMUNICATION_LEVELS, default: 'No Difficulty' },
  { key: 'emotionalWellbeing', label: 'Emotional Well-being', options: EMOTIONAL_SUPPORT_LEVELS, default: 'Mild Support Needed' },
  { key: 'homeSafety', label: 'Home Safety', options: HOME_SAFETY_LEVELS, default: 'Moderate Risk' },
];

module.exports = {
  ASSISTANCE_LEVELS,
  COGNITIVE_LEVELS,
  COMMUNICATION_LEVELS,
  EMOTIONAL_SUPPORT_LEVELS,
  HOME_SAFETY_LEVELS,
  SERVICE_FREQUENCIES,
  SERVICE_DURATIONS,
  SERVICE_PROVIDERS,
  DEFAULT_SERVICES,
  CARE_OVERVIEW_CATEGORIES,
  ASSESSMENT_FIELDS,
};

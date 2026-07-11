/** Consolidated Caregiver Interview Assessment — skill / competency list (PDF reference) */
const INTERVIEW_SKILLS = [
  'Communication',
  'Empathy',
  'Professionalism',
  'Attendance & Reliability',
  'Language Skills',
  'Personal Hygiene',
  'Bathing & Grooming',
  'Patient Transfer',
  'Feeding Assistance',
  'Toileting & Incontinence',
  'Medication Reminder',
  'Vital Signs',
  'Dementia Care',
  'Palliative Care',
  'Infection Control',
  'Fall Prevention',
  'Emergency Response',
  'Documentation',
  'Wheelchair Handling',
  'Safe Lifting',
  'Patient Positioning',
  'PPE Usage',
  'Medical Equipment',
  'Family Interaction',
  'Behaviour',
  'Patience',
  'Problem Solving',
  'Time Management',
  'Client Handling',
  'Overall Suitability',
];

const FINAL_RECOMMENDATIONS = [
  { value: 'strong_hire', label: 'Strong Hire' },
  { value: 'hire', label: 'Hire' },
  { value: 'hold', label: 'Hold' },
  { value: 'reject', label: 'Reject' },
];

const RATING_SCALE = [
  { value: 1, label: 'Poor' },
  { value: 2, label: 'Basic' },
  { value: 3, label: 'Competent' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Excellent' },
];

module.exports = {
  INTERVIEW_SKILLS,
  FINAL_RECOMMENDATIONS,
  RATING_SCALE,
};

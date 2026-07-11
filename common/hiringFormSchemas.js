const PDF_FORM_CODES = new Set([
  '1010', '1020', '1021', '1050', '1060', '1070',
  '1201', '1202', '1203', '1204', '1220', '1530', '1600',
  '1720', '1740', '2900', '4000', 'I-9', 'W-4',
]);

const getFormSchema = (documentCode) => {
  if (PDF_FORM_CODES.has(documentCode)) {
    return { type: 'pdf_fillable', label: documentCode, defaultData: {} };
  }
  return { type: 'unsupported', label: 'Form', defaultData: {} };
};

const buildEmptyFormData = (documentCode) => {
  const schema = getFormSchema(documentCode);
  return JSON.parse(JSON.stringify(schema.defaultData));
};

const hasPdfForm = (documentCode) => PDF_FORM_CODES.has(documentCode);

module.exports = {
  PDF_FORM_CODES,
  getFormSchema,
  buildEmptyFormData,
  hasPdfForm,
};

const parseExperience = (value) => {
  if (value === '' || value == null) return 0;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  const str = String(value).trim();
  if (!str || str === 'Fresher') return 0;
  const parsed = parseFloat(str);
  if (!Number.isNaN(parsed)) return parsed;
  if (str.includes('1-3')) return 2;
  if (str.includes('3-5')) return 4;
  if (str.includes('5+')) return 5;
  return 0;
};

const buildUploadUrl = (storedPath) => {
  if (!storedPath) return '';
  let clean = String(storedPath).replace(/^\/+/, '');
  if (clean.startsWith('uploads/')) clean = clean.slice('uploads/'.length);
  if (clean.startsWith('api/uploads/')) clean = clean.slice('api/uploads/'.length);
  return `/api/uploads/${clean}`;
};

module.exports = { parseExperience, buildUploadUrl };

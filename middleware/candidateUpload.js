const fs = require('fs');
const path = require('path');
const multer = require('multer');

const baseDir = path.join(__dirname, '../uploads/candidates');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sub = file.fieldname === 'profile_pic' ? 'profile_pics' : 'resumes';
    const dir = path.join(baseDir, sub);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'profile_pic') {
      if (['.jpg', '.jpeg', '.png'].includes(ext)) return cb(null, true);
      return cb(new Error('Profile picture must be JPG, JPEG, or PNG'));
    }
    if (file.fieldname === 'resume') {
      if (ext === '.pdf') return cb(null, true);
      return cb(new Error('Resume must be a PDF file'));
    }
    return cb(null, true);
  },
});

module.exports = upload.fields([
  { name: 'profile_pic', maxCount: 1 },
  { name: 'resume', maxCount: 1 },
]);

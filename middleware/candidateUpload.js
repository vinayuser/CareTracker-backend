const fs = require('fs');
const path = require('path');
const multer = require('multer');

const MAX_PROFILE_PIC_BYTES = 1 * 1024 * 1024; // 1 MB
const MAX_RESUME_BYTES = 10 * 1024 * 1024; // 10 MB

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
  limits: { fileSize: MAX_RESUME_BYTES },
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

const fieldsUpload = upload.fields([
  { name: 'profile_pic', maxCount: 1 },
  { name: 'resume', maxCount: 1 },
]);

function unlinkQuiet(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore cleanup errors
  }
}

/** Enforce 1 MB max on profile pictures after multer writes the file. */
function enforceProfilePicSize(req, res, next) {
  const pic = req.files?.profile_pic?.[0];
  if (pic && pic.size > MAX_PROFILE_PIC_BYTES) {
    unlinkQuiet(pic.path);
    if (req.files.resume?.[0]?.path) unlinkQuiet(req.files.resume[0].path);
    return next(new Error('Profile picture must be 1 MB or smaller'));
  }
  return next();
}

module.exports = (req, res, next) => {
  fieldsUpload(req, res, (err) => {
    if (err) return next(err);
    return enforceProfilePicSize(req, res, next);
  });
};

const fs = require('fs');
const path = require('path');
const multer = require('multer');

const ALLOWED_EXT = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.jpg', '.jpeg', '.png', '.webp'];
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_IMAGE_BYTES = 1 * 1024 * 1024; // 1 MB
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB (non-images)

const baseDir = path.join(__dirname, '../uploads/agency-documents');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const agencyId = String(req.params.id || 'temp');
    const dir = path.join(baseDir, agencyId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const safe = String(file.originalname || 'document')
      .replace(/[^\w.\-]+/g, '_')
      .slice(0, 80);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}${ext.startsWith('.') ? '' : ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return cb(new Error('File must be PDF, Word, Excel, CSV, or image'));
    }
    return cb(null, true);
  },
});

const singleUpload = upload.single('file');

function unlinkQuiet(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

function enforceImageSize(req, res, next) {
  const file = req.file;
  if (!file) return next();
  const ext = path.extname(file.originalname || file.filename || '').toLowerCase();
  const isImage = IMAGE_EXT.includes(ext) || String(file.mimetype || '').startsWith('image/');
  if (isImage && file.size > MAX_IMAGE_BYTES) {
    unlinkQuiet(file.path);
    return next(new Error('Image must be 1 MB or smaller'));
  }
  return next();
}

module.exports = {
  uploadDocument: (req, res, next) => {
    singleUpload(req, res, (err) => {
      if (err) return next(err);
      return enforceImageSize(req, res, next);
    });
  },
};

const fs = require('fs');
const path = require('path');
const multer = require('multer');

const DOC_KEYS = [
  'insuranceCard',
  'photoId',
  'medicareCard',
  'medicaidCard',
  'prescriptionCard',
  'otherDocuments',
];

const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic'];
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic'];
const MAX_IMAGE_BYTES = 1 * 1024 * 1024; // 1 MB
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB (PDFs / non-images)

const baseDir = path.join(__dirname, '../uploads/insurance-intakes');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const intakeId = String(req.params.id || 'temp');
    const dir = path.join(baseDir, intakeId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const docKey = String(req.params.docKey || 'document');
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `${docKey}-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (req, file, cb) => {
    const docKey = String(req.params.docKey || '');
    if (!DOC_KEYS.includes(docKey)) {
      return cb(new Error('Invalid document type'));
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return cb(new Error('Document must be PDF or image (JPG, PNG, WEBP, GIF)'));
    }
    return cb(null, true);
  },
});

const singleUpload = upload.single('document');

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
  DOC_KEYS,
  uploadDocument: (req, res, next) => {
    singleUpload(req, res, (err) => {
      if (err) return next(err);
      return enforceImageSize(req, res, next);
    });
  },
};

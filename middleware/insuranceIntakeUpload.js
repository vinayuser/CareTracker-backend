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
  limits: { fileSize: 15 * 1024 * 1024 },
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

module.exports = {
  DOC_KEYS,
  uploadDocument: upload.single('document'),
};

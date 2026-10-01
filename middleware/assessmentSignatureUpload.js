const fs = require('fs');
const path = require('path');
const multer = require('multer');

const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.webp'];
const baseDir = path.join(__dirname, '../uploads/assessment-signatures');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(baseDir, { recursive: true });
    cb(null, baseDir);
  },
  filename: (req, file, cb) => {
    const ext = ALLOWED_EXT.includes(path.extname(file.originalname).toLowerCase())
      ? path.extname(file.originalname).toLowerCase()
      : '.png';
    cb(null, `signature-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    if (!ALLOWED_EXT.includes(ext) && !mime.startsWith('image/')) {
      return cb(new Error('Signature must be a PNG or JPEG image'));
    }
    return cb(null, true);
  },
});

module.exports = {
  uploadSignature: upload.single('signature'),
};

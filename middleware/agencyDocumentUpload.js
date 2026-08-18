const fs = require('fs');
const path = require('path');
const multer = require('multer');

const ALLOWED_EXT = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.jpg', '.jpeg', '.png', '.webp'];
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
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return cb(new Error('File must be PDF, Word, Excel, CSV, or image'));
    }
    return cb(null, true);
  },
});

module.exports = {
  uploadDocument: upload.single('file'),
};

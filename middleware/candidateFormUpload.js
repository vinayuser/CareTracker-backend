const fs = require('fs');
const path = require('path');
const multer = require('multer');

const baseDir = path.join(__dirname, '../uploads/candidates/filled-documents');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const token = req.params?.token || 'unknown';
    const dir = path.join(baseDir, String(token));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const code = req.params?.documentCode || 'form';
    cb(null, `${code}-${Date.now()}.pdf`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      return cb(null, true);
    }
    return cb(new Error('Filled document must be a PDF file'));
  },
});

module.exports = upload.single('filled_document');

const fs = require('fs');
const path = require('path');

const MAX_IMAGE_BYTES = 1 * 1024 * 1024; // 1 MB

const EXT_MAP = {
  jpeg: 'jpg',
  jpg: 'jpg',
  png: 'png',
  gif: 'gif',
  webp: 'webp',
};

const assertImageSize = (buffer, label = 'Image') => {
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`${label} must be 1 MB or smaller`);
  }
};

/**
 * Resolve a profile pic field from the client payload.
 * - undefined → no change (returns null)
 * - '' / null → clear (returns '')
 * - data:image/...;base64,... → save under uploads/<folder>/profile_pics/ and return relative path
 * - existing http(s) or /api/uploads URL → no change (returns null)
 *
 * @param {string|undefined|null} profilePic
 * @param {'clients'|'caregivers'|'candidates'} folder
 * @returns {string|null}
 */
const resolveProfilePicPath = (profilePic, folder) => {
  if (profilePic === undefined) return null;
  if (profilePic === null || profilePic === '') return '';

  const value = String(profilePic);
  if (!value.startsWith('data:image/')) return null;

  const match = value.match(/^data:image\/([\w+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw new Error('Invalid profile picture data');

  const rawType = match[1].toLowerCase().replace('+xml', '');
  const ext = EXT_MAP[rawType];
  if (!ext) throw new Error('Profile picture must be JPG, PNG, GIF, or WebP');

  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  assertImageSize(buffer, 'Profile picture');

  const dir = path.join(__dirname, '../uploads', folder, 'profile_pics');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  return `${folder}/profile_pics/${filename}`;
};

/**
 * Resolve an agency logo from the client payload (same rules as profile pics).
 * Saves under uploads/agencies/logos/
 *
 * @param {string|undefined|null} logo
 * @returns {string|null}
 */
const resolveAgencyLogoPath = (logo) => {
  if (logo === undefined) return null;
  if (logo === null || logo === '') return '';

  const value = String(logo);
  if (!value.startsWith('data:image/')) return null;

  const match = value.match(/^data:image\/([\w+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw new Error('Invalid agency logo data');

  const rawType = match[1].toLowerCase().replace('+xml', '');
  const ext = EXT_MAP[rawType];
  if (!ext) throw new Error('Agency logo must be JPG, PNG, GIF, or WebP');

  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  assertImageSize(buffer, 'Agency logo');

  const dir = path.join(__dirname, '../uploads/agencies/logos');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  return `agencies/logos/${filename}`;
};

module.exports = { resolveProfilePicPath, resolveAgencyLogoPath, MAX_IMAGE_BYTES };

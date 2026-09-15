const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const BrandingSettings = require('../models/BrandingSettings');
const config = require('../config/environment');
const logger = require('../utils/logger');

const router = express.Router();

const ALLOWED_LOGO_TYPES = {
  'image/svg+xml': '.svg',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp'
};

const uploadDir = path.join(config.upload.uploadPath, 'branding');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = ALLOWED_LOGO_TYPES[file.mimetype] || '';
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, Boolean(ALLOWED_LOGO_TYPES[file.mimetype]));
  }
});

// Gates writes behind a shared secret set by whoever deployed this instance
// (ADMIN_SETUP_TOKEN in the backend .env). There are no user accounts in
// Rumo, so this is the only thing standing between a public instance and
// anyone rewriting its branding - fails closed if the token isn't set.
function requireAdminToken(req, res, next) {
  const configured = config.adminSetupToken;
  if (!configured) {
    return res.status(403).json({
      error: 'Admin settings are disabled. Set ADMIN_SETUP_TOKEN in the backend .env to enable them.'
    });
  }

  const provided = Buffer.from(req.get('x-admin-token') || '');
  const expected = Buffer.from(configured);
  const valid = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);

  if (!valid) {
    return res.status(401).json({ error: 'Invalid admin token' });
  }

  next();
}

function serializeBranding(row) {
  return {
    configured: true,
    appName: row.app_name,
    tagline: row.tagline,
    description: row.description,
    logoIcon: row.logo_icon,
    logoFull: row.logo_full,
    primaryColor: row.primary_color,
    updatedAt: row.updated_at
  };
}

// Public - the landing/pre-join/meeting screens read this on every load.
router.get('/branding', async (req, res) => {
  try {
    const row = await BrandingSettings.get();
    res.json(row ? serializeBranding(row) : { configured: false });
  } catch (error) {
    logger.error('Error fetching branding settings:', error);
    res.status(500).json({ error: 'Failed to fetch branding settings' });
  }
});

router.put('/branding', requireAdminToken, [
  body('appName').optional().isLength({ min: 1, max: 100 }).trim(),
  body('tagline').optional({ nullable: true }).isLength({ max: 200 }).trim(),
  body('description').optional({ nullable: true }).isLength({ max: 300 }).trim(),
  body('logoIcon').optional({ nullable: true }).isLength({ max: 500 }).trim(),
  body('logoFull').optional({ nullable: true }).isLength({ max: 500 }).trim(),
  body('primaryColor').optional().matches(/^#[0-9a-fA-F]{6}$/).withMessage('primaryColor must be a hex color like #2E5BFF')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }

  try {
    const { appName, tagline, description, logoIcon, logoFull, primaryColor } = req.body;
    const row = await BrandingSettings.upsert({
      app_name: appName,
      tagline,
      description,
      logo_icon: logoIcon,
      logo_full: logoFull,
      primary_color: primaryColor
    });

    logger.info('Branding settings updated');
    res.json(serializeBranding(row));
  } catch (error) {
    logger.error('Error updating branding settings:', error);
    res.status(500).json({ error: 'Failed to update branding settings' });
  }
});

router.post('/branding/logo', requireAdminToken, (req, res) => {
  upload.single('logo')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded, or the file type is not one of: SVG, PNG, JPEG, WebP' });
    }

    res.json({ url: `/uploads/branding/${req.file.filename}` });
  });
});

module.exports = router;

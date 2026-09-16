const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const BrandingSettings = require('../models/BrandingSettings');
const config = require('../config/environment');
const logger = require('../utils/logger');
const { FEATURE_DEFAULTS, withFeatureDefaults } = require('../config/features');

const router = express.Router();

const ALLOWED_IMAGE_TYPES = {
  'image/svg+xml': '.svg',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp'
};

const logoUploadDir = path.join(config.upload.uploadPath, 'branding');
const backgroundUploadDir = path.join(config.upload.uploadPath, 'backgrounds');
fs.mkdirSync(logoUploadDir, { recursive: true });
fs.mkdirSync(backgroundUploadDir, { recursive: true });

function makeUpload(destination, maxFileSize) {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, destination),
      filename: (req, file, cb) => {
        const ext = ALLOWED_IMAGE_TYPES[file.mimetype] || '';
        cb(null, `${crypto.randomUUID()}${ext}`);
      }
    }),
    limits: { fileSize: maxFileSize },
    fileFilter: (req, file, cb) => cb(null, Boolean(ALLOWED_IMAGE_TYPES[file.mimetype]))
  });
}

const uploadLogo = makeUpload(logoUploadDir, 2 * 1024 * 1024);
const uploadBackground = makeUpload(backgroundUploadDir, 5 * 1024 * 1024);

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
    features: withFeatureDefaults(row.features),
    backgroundPresets: row.background_presets || [],
    adminPageEnabled: row.admin_page_enabled !== false,
    updatedAt: row.updated_at
  };
}

// Public - the landing/pre-join/meeting screens read this on every load.
router.get('/branding', async (req, res) => {
  try {
    const row = await BrandingSettings.get();
    res.json(row ? serializeBranding(row) : { configured: false, features: FEATURE_DEFAULTS, backgroundPresets: [], adminPageEnabled: true });
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
  body('primaryColor').optional().matches(/^#[0-9a-fA-F]{6}$/).withMessage('primaryColor must be a hex color like #2E5BFF'),
  body('features').optional().isObject().withMessage('features must be an object'),
  body('adminPageEnabled').optional().isBoolean().withMessage('adminPageEnabled must be a boolean')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }

  try {
    const { appName, tagline, description, logoIcon, logoFull, primaryColor, features, adminPageEnabled } = req.body;

    let mergedFeatures;
    if (features) {
      // Merge onto whatever's already stored, so a partial update from the
      // admin UI (only the flags that were flipped) doesn't wipe the rest.
      const existing = await BrandingSettings.get();
      const current = withFeatureDefaults(existing?.features);
      mergedFeatures = { ...current };
      for (const key of Object.keys(FEATURE_DEFAULTS)) {
        if (typeof features[key] === 'boolean') {
          mergedFeatures[key] = features[key];
        }
      }
    }

    const row = await BrandingSettings.upsert({
      app_name: appName,
      tagline,
      description,
      logo_icon: logoIcon,
      logo_full: logoFull,
      primary_color: primaryColor,
      features: mergedFeatures,
      admin_page_enabled: adminPageEnabled
    });

    logger.info('Branding settings updated');
    res.json(serializeBranding(row));
  } catch (error) {
    logger.error('Error updating branding settings:', error);
    res.status(500).json({ error: 'Failed to update branding settings' });
  }
});

router.post('/branding/logo', requireAdminToken, (req, res) => {
  uploadLogo.single('logo')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded, or the file type is not one of: SVG, PNG, JPEG, WebP' });
    }

    res.json({ url: `/uploads/branding/${req.file.filename}` });
  });
});

// Admin-managed default virtual backgrounds, offered to every participant
// alongside whatever they upload for themselves in a given call.
router.post('/branding/backgrounds', requireAdminToken, (req, res) => {
  uploadBackground.single('background')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded, or the file type is not one of: PNG, JPEG, WebP' });
    }

    try {
      const existing = await BrandingSettings.get();
      const presets = existing?.background_presets || [];
      const entry = {
        id: crypto.randomUUID(),
        url: `/uploads/backgrounds/${req.file.filename}`,
        name: (req.body.name || req.file.originalname || 'Background').slice(0, 60)
      };

      const row = await BrandingSettings.upsert({ background_presets: [...presets, entry] });
      res.status(201).json({ backgroundPresets: row.background_presets });
    } catch (error) {
      logger.error('Error adding background preset:', error);
      res.status(500).json({ error: 'Failed to add background' });
    }
  });
});

router.delete('/branding/backgrounds/:id', requireAdminToken, async (req, res) => {
  try {
    const existing = await BrandingSettings.get();
    const presets = existing?.background_presets || [];
    const target = presets.find((p) => p.id === req.params.id);

    if (!target) {
      return res.status(404).json({ error: 'Background not found' });
    }

    const remaining = presets.filter((p) => p.id !== req.params.id);
    const row = await BrandingSettings.upsert({ background_presets: remaining });

    const filePath = path.join(config.upload.uploadPath, target.url.replace(/^\/uploads\//, ''));
    fs.unlink(filePath, () => {
      // Best-effort - the DB record (the part that actually matters) is
      // already gone even if the file happens to be missing/locked.
    });

    res.json({ backgroundPresets: row.background_presets });
  } catch (error) {
    logger.error('Error removing background preset:', error);
    res.status(500).json({ error: 'Failed to remove background' });
  }
});

module.exports = router;

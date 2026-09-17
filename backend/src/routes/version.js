const express = require('express');
const logger = require('../utils/logger');
const { checkLatestRelease } = require('../utils/versionCheck');

const router = express.Router();

// Public - the admin panel and landing page both poll this for the small
// "update available" notice. Cheap: the actual GitHub call is cached for a
// day (see versionCheck.js), this just returns whatever that cache holds.
router.get('/', async (req, res) => {
  try {
    const result = await checkLatestRelease();
    res.json(result);
  } catch (error) {
    logger.error('Error checking version:', error);
    res.status(500).json({ error: 'Failed to check version' });
  }
});

module.exports = router;

const pkg = require('../../package.json');
const config = require('../config/environment');
const logger = require('./logger');

const CURRENT_VERSION = pkg.version;
const GITHUB_REPO = 'BrahmjotSingh0/rumo';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // Once a day is plenty - this isn't urgent, and it's one outbound GitHub request per running instance, not per visitor.

let cached = null; // { latest, releaseUrl, checkedAt }

function isNewer(latest, current) {
  if (!latest) return false;
  const toParts = (v) => String(v).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const [lMaj, lMin, lPatch] = toParts(latest);
  const [cMaj, cMin, cPatch] = toParts(current);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPatch > cPatch;
}

// Fetches the latest published GitHub release, cached for CHECK_INTERVAL_MS.
// Entirely anonymous - a plain unauthenticated GET to GitHub's public API,
// no data about this instance or its users is sent. Self-hosters who'd
// rather this server never phone out at all can set VERSION_CHECK_ENABLED=false.
async function checkLatestRelease() {
  if (!config.versionCheckEnabled) {
    return { current: CURRENT_VERSION, latest: null, updateAvailable: false, releaseUrl: null };
  }

  if (!cached || Date.now() - cached.checkedAt >= CHECK_INTERVAL_MS) {
    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'rumo-self-hosted' }
      });
      if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}`);
      }
      const data = await response.json();
      cached = {
        latest: data.tag_name ? data.tag_name.replace(/^v/, '') : null,
        releaseUrl: data.html_url || null,
        checkedAt: Date.now()
      };
    } catch (error) {
      logger.warn('Version check failed:', error.message);
      // Keep the previous result (if any) rather than flapping to "no
      // update" just because one check failed - only replace it with a
      // fresh "unknown" state if we've never successfully checked at all.
      if (!cached) {
        cached = { latest: null, releaseUrl: null, checkedAt: Date.now() };
      }
    }
  }

  return {
    current: CURRENT_VERSION,
    latest: cached.latest,
    updateAvailable: isNewer(cached.latest, CURRENT_VERSION),
    releaseUrl: cached.releaseUrl
  };
}

module.exports = { CURRENT_VERSION, checkLatestRelease, isNewer };

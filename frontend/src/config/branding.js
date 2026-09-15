import { API_BASE_URL } from '../utils/constants';

// Default branding, overridden at runtime - in order - by public/branding.json
// (edit that file directly, or bind-mount your own version over it: no
// rebuild needed) and then by whatever's saved through the admin panel at
// /admin (backed by the database, so it wins since it's the most recent
// change made by whoever runs this instance). See main.jsx for when this runs.
const branding = {
  appName: 'Rumo',
  tagline: 'Connect, collaborate, create.',
  description: 'Free, self-hosted video meetings.',

  // Icon mark used in the app UI (header, pre-join screen).
  logoIcon: '/brand/icon.svg',

  // Full lockup (icon + wordmark), used for README/social/static contexts.
  logoFull: '/brand/logo.svg',

  primaryColor: '#2E5BFF',
};

// Logos uploaded through the admin panel are served by the backend, so they
// need an absolute URL rather than one relative to the frontend's own origin.
function resolveAssetUrl(value) {
  if (typeof value === 'string' && value.startsWith('/uploads/')) {
    return `${API_BASE_URL}${value}`;
  }
  return value;
}

export async function loadBranding() {
  try {
    const res = await fetch('/branding.json', { cache: 'no-store' });
    if (res.ok) {
      Object.assign(branding, await res.json());
    }
  } catch {
    // No branding.json, or it's unreachable/invalid - keep the defaults.
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/settings/branding`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.configured) {
        if (data.appName) branding.appName = data.appName;
        if (data.tagline) branding.tagline = data.tagline;
        if (data.description) branding.description = data.description;
        if (data.logoIcon) branding.logoIcon = resolveAssetUrl(data.logoIcon);
        if (data.logoFull) branding.logoFull = resolveAssetUrl(data.logoFull);
        if (data.primaryColor) branding.primaryColor = data.primaryColor;
      }
    }
  } catch {
    // Backend unreachable - keep whatever branding.json/defaults gave us.
  }

  return branding;
}

export default branding;

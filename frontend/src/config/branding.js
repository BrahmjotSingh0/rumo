import { API_BASE_URL } from '../utils/constants';

// Default branding, overridden at runtime - in order - by public/branding.json
// (edit that file directly, or bind-mount your own version over it: no
// rebuild needed) and then by whatever's saved through the admin panel at
// /admin (backed by the database, so it wins since it's the most recent
// change made by whoever runs this instance). See main.jsx for when this runs.
// Exported so Home.jsx can tell "still the untouched default" apart from "a
// self-hoster set their own tagline/description" - only the former gets
// translated (there's no way to auto-translate arbitrary custom brand copy).
export const DEFAULT_TAGLINE = 'Connect, collaborate, create.';
export const DEFAULT_DESCRIPTION = 'Free, self-hosted video meetings.';

// Mirrors backend/src/config/features.js - kept here too so the UI has a
// sane fallback if the backend is unreachable when the app first loads.
export const DEFAULT_FEATURES = {
  chat: true,
  screenShare: true,
  virtualBackgrounds: true,
  coHost: true,
  waitingRoom: true,
  muteAll: true,
  disableAllCameras: true,
  disableAllScreenShares: true,
  lockMeeting: true,
  layoutSwitch: true,
  raiseHand: true,
  reactions: true,
  liveCaptions: true,
  localRecording: true,
  polls: true,
  fileSharing: true,
  whiteboard: true,
  breakoutRooms: true,
  hostControls: true,
  embedding: true,
};

const branding = {
  appName: 'Rumo',
  tagline: DEFAULT_TAGLINE,
  description: DEFAULT_DESCRIPTION,

  // Icon mark used in the app UI (header, pre-join screen).
  logoIcon: '/brand/icon.svg',

  // Full lockup (icon + wordmark), used for README/social/static contexts.
  logoFull: '/brand/logo.svg',

  primaryColor: '#2E5BFF',

  // Which optional features/host controls the admin has left enabled, and
  // the shared virtual-background gallery they've curated. Both come from
  // the backend only (not branding.json) since they involve server state.
  features: { ...DEFAULT_FEATURES },
  backgroundPresets: [],
  adminPageEnabled: true,
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
      // These come back with defaults applied regardless of `configured`.
      if (data.features) branding.features = data.features;
      if (data.adminPageEnabled !== undefined) branding.adminPageEnabled = data.adminPageEnabled;
      if (data.backgroundPresets) {
        branding.backgroundPresets = data.backgroundPresets.map((preset) => ({
          ...preset,
          url: resolveAssetUrl(preset.url),
        }));
      }
    }
  } catch {
    // Backend unreachable - keep whatever branding.json/defaults gave us.
  }

  return branding;
}

export default branding;

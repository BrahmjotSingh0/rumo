// Default branding. Overridden at runtime by public/branding.json (loaded
// once via loadBranding() before the app renders - see main.jsx), so
// self-hosters can re-brand a deployment by editing/replacing that one JSON
// file - no rebuild, no touching source. Editing the defaults below only
// matters if you're building the frontend from source yourself.
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

// Fetches public/branding.json (same origin, so this works with a bind-mount
// or a file replaced post-build) and merges any fields it defines over the
// defaults above. Safe to call even if the file is missing or invalid.
export async function loadBranding() {
  try {
    const res = await fetch('/branding.json', { cache: 'no-store' });
    if (res.ok) {
      Object.assign(branding, await res.json());
    }
  } catch {
    // No branding.json, or it's unreachable/invalid - keep the defaults.
  }
  return branding;
}

export default branding;

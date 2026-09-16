// Canonical list of optional features/host controls an admin can turn off
// for this instance from the /admin panel. A key missing from the stored
// JSON (or no row at all) defaults to enabled - self-hosters who never touch
// this get every feature, same as before this config existed.
//
// This only controls what the UI offers (client-side gating), the same
// trust level as the rest of Rumo's host/room controls - it's an operator
// convenience for tailoring the instance, not a security boundary.
const FEATURE_DEFAULTS = {
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
  reactions: true
};

function withFeatureDefaults(features) {
  return { ...FEATURE_DEFAULTS, ...(features || {}) };
}

module.exports = { FEATURE_DEFAULTS, withFeatureDefaults };

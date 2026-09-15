// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

// App name/logo/tagline/color live in src/config/branding.js (loaded from
// public/branding.json at runtime) - import branding directly where needed
// rather than a frozen copy here, since that config loads asynchronously.
export const APP_VERSION = '1.0.0';

// WebRTC Configuration
// STUN is free/public and enough for most networks. A TURN server is only
// needed for participants behind restrictive NATs/firewalls - configure your
// own via VITE_TURN_URL/VITE_TURN_USERNAME/VITE_TURN_CREDENTIAL (see .env.example).
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  ...(import.meta.env.VITE_TURN_URL ? [{
    urls: import.meta.env.VITE_TURN_URL,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL
  }] : [])
];

// Meeting Configuration
export const MAX_PARTICIPANTS = 50;
export const CHAT_MESSAGE_LIMIT = 500;

// Media Constraints
export const VIDEO_CONSTRAINTS = {
  high: {
    width: { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },
    frameRate: { ideal: 30, max: 60 }
  },
  medium: {
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: 30, max: 30 }
  },
  low: {
    width: { ideal: 640, max: 640 },
    height: { ideal: 480, max: 480 },
    frameRate: { ideal: 15, max: 15 }
  }
};

export const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000
};

// UI Constants
export const UI_CONFIG = {
  BRAND_COLOR: '#3b82f6',
  THEME: 'dark'
};

export const TOAST_DURATION = {
  SHORT: 2000,
  MEDIUM: 4000,
  LONG: 6000
};

export const RESPONSIVE_BREAKPOINTS = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px'
};

// Connection Quality Levels
export const CONNECTION_QUALITY = {
  EXCELLENT: { score: 90, label: 'Excellent', color: 'green' },
  GOOD: { score: 70, label: 'Good', color: 'blue' },
  FAIR: { score: 50, label: 'Fair', color: 'yellow' },
  POOR: { score: 30, label: 'Poor', color: 'orange' },
  VERY_POOR: { score: 0, label: 'Very Poor', color: 'red' }
};

// Feature Flags
export const FEATURES = {
  SCREEN_SHARE: true,
  CHAT: true,
  HOST_CONTROLS: true,
  INVITE_LINK: true
};

// Error Messages
export const ERROR_MESSAGES = {
  MEDIA_ACCESS_DENIED: 'Camera and microphone access denied. Please allow permissions and refresh.',
  MEDIA_NOT_FOUND: 'No camera or microphone found. Please check your devices.',
  CONNECTION_FAILED: 'Failed to connect to the meeting. Please check your internet connection.',
  ROOM_NOT_FOUND: 'Meeting room not found. Please check the room ID.',
  ROOM_FULL: 'This meeting room is full. Please try again later.',
  NETWORK_ERROR: 'Network error occurred. Please check your connection.',
  UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.'
};

// Keyboard Shortcuts
export const KEYBOARD_SHORTCUTS = {
  TOGGLE_AUDIO: 'KeyM',
  TOGGLE_VIDEO: 'KeyV',
  TOGGLE_CHAT: 'KeyC',
  TOGGLE_PARTICIPANTS: 'KeyP',
  LEAVE_MEETING: 'KeyL'
};
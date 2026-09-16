import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconLock as Lock } from '@tabler/icons-react'
import toast from 'react-hot-toast';
import Button from './ui/Button';
import Input from './ui/Input';
import branding from '../config/branding';
import { applyTheme } from '../utils/theme';
import { API_BASE_URL } from '../utils/constants';

const TOKEN_STORAGE_KEY = 'rumo_admin_token';

const previewUrl = (value) => {
  if (typeof value === 'string' && value.startsWith('/uploads/')) {
    return `${API_BASE_URL}${value}`;
  }
  return value;
};

// Label/description shown for each toggle in the Features card. Keys must
// match backend/src/config/features.js exactly.
const FEATURE_LABELS = [
  { key: 'chat', label: 'Chat', description: 'Text chat during meetings' },
  { key: 'screenShare', label: 'Screen sharing', description: 'Anyone can share their screen (subject to host permission)' },
  { key: 'virtualBackgrounds', label: 'Virtual backgrounds', description: 'Background blur/replacement in the settings panel' },
  { key: 'coHost', label: 'Co-hosts', description: 'Promoting participants to co-host' },
  { key: 'waitingRoom', label: 'Private rooms / waiting room', description: 'The Room Type host control' },
  { key: 'muteAll', label: 'Mute all', description: 'The Mute All Participants host control' },
  { key: 'disableAllCameras', label: 'Disable all cameras', description: 'The Disable All Cameras host control' },
  { key: 'disableAllScreenShares', label: 'Disable all screen shares', description: 'The Disable All Screen Shares host control' },
  { key: 'lockMeeting', label: 'Lock meeting', description: 'Prevent anyone new from joining' },
  { key: 'layoutSwitch', label: 'Layout switcher', description: 'Grid / speaker / sidebar / spotlight / interview / webinar layout switcher' },
  { key: 'raiseHand', label: 'Raise hand', description: 'The raise-hand control' },
  { key: 'reactions', label: 'Reactions', description: 'Emoji reactions during a call' },
  { key: 'liveCaptions', label: 'Live captions', description: 'Browser-only speech-to-text, shared with the room' },
  { key: 'localRecording', label: 'Local recording', description: 'Let participants record their own camera & mic to their device' },
  { key: 'polls', label: 'Polls', description: 'Host/co-host can create a quick multiple-choice poll' },
  { key: 'fileSharing', label: 'File sharing', description: 'Share small files in chat' },
  { key: 'whiteboard', label: 'Whiteboard', description: 'A shared drawing surface, synced live to everyone in the room' },
  { key: 'breakoutRooms', label: 'Breakout rooms', description: 'Host can split participants into separate sub-rooms' },
  { key: 'embedding', label: 'Embedding', description: 'Allow this instance to be embedded in an iframe on other sites (see docs/EMBEDDING.md)' },
];

const Admin = () => {
  const [token, setToken] = useState(() => {
    try {
      return sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [form, setForm] = useState({
    appName: branding.appName,
    tagline: branding.tagline,
    description: branding.description,
    primaryColor: branding.primaryColor,
    logoIcon: branding.logoIcon,
    logoFull: branding.logoFull,
    features: { ...branding.features },
    adminPageEnabled: branding.adminPageEnabled !== false,
  });
  // The disabled state is only a presentational deterrent (see the schema
  // comment on admin_page_enabled) - the real gate is still the token check
  // on every write below, so typing the right token here always gets back in.
  const [unlocked, setUnlocked] = useState(branding.adminPageEnabled !== false);
  const [backgroundPresets, setBackgroundPresets] = useState(branding.backgroundPresets);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [uploadingBackground, setUploadingBackground] = useState(false);

  const toggleFeature = (key) =>
    setForm((prev) => ({ ...prev, features: { ...prev.features, [key]: !prev.features[key] } }));

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const requireToken = () => {
    if (!token.trim()) {
      toast.error('Enter your admin token first (ADMIN_SETUP_TOKEN in the backend .env).');
      return false;
    }
    return true;
  };

  const uploadLogo = async (field, file) => {
    if (!requireToken() || !file) return;

    setUploading(field);
    try {
      const body = new FormData();
      body.append('logo', file);

      const res = await fetch(`${API_BASE_URL}/api/settings/branding/logo`, {
        method: 'POST',
        headers: { 'x-admin-token': token },
        body,
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Upload failed');
        return;
      }

      update(field, data.url);
      toast.success('Logo uploaded. Save to apply it.');
    } catch {
      toast.error('Upload failed. Is the backend reachable?');
    } finally {
      setUploading('');
    }
  };

  const addBackground = async (file) => {
    if (!requireToken() || !file) return;

    setUploadingBackground(true);
    try {
      const body = new FormData();
      body.append('background', file);
      body.append('name', file.name.replace(/\.[^.]+$/, '').slice(0, 60));

      const res = await fetch(`${API_BASE_URL}/api/settings/branding/backgrounds`, {
        method: 'POST',
        headers: { 'x-admin-token': token },
        body,
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Upload failed');
        return;
      }

      const resolved = data.backgroundPresets.map((p) => ({ ...p, url: previewUrl(p.url) }));
      setBackgroundPresets(resolved);
      branding.backgroundPresets = resolved;
      toast.success('Background added.');
    } catch {
      toast.error('Upload failed. Is the backend reachable?');
    } finally {
      setUploadingBackground(false);
    }
  };

  const removeBackground = async (id) => {
    if (!requireToken()) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/settings/branding/backgrounds/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': token },
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to remove background');
        return;
      }

      const resolved = data.backgroundPresets.map((p) => ({ ...p, url: previewUrl(p.url) }));
      setBackgroundPresets(resolved);
      branding.backgroundPresets = resolved;
    } catch {
      toast.error('Failed to remove background. Is the backend reachable?');
    }
  };

  const save = async () => {
    if (!requireToken()) return;

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/settings/branding`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': token,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Save failed');
        return;
      }

      try {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
      } catch {
        // private browsing etc - saving still worked, just won't be remembered
      }

      Object.assign(branding, form);
      applyTheme(form.primaryColor);
      document.title = form.appName;

      toast.success('Branding saved.');
    } catch {
      toast.error('Save failed. Is the backend reachable?');
    } finally {
      setSaving(false);
    }
  };

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-gray-800/50 border border-gray-700 rounded-2xl p-6 sm:p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-gray-700/60 flex items-center justify-center mx-auto">
            <Lock className="text-gray-300" size={22} />
          </div>
          <h1 className="text-lg font-semibold text-white">Admin panel disabled</h1>
          <p className="text-sm text-gray-400">
            The operator of this instance turned off this page for casual visitors. If that&apos;s you, enter your
            admin token to get back in.
          </p>
          <Input
            type="password"
            placeholder="Admin token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <Button
            onClick={() => {
              if (!token.trim()) {
                toast.error('Enter your admin token first.');
                return;
              }
              setUnlocked(true);
            }}
            className="w-full"
          >
            Unlock
          </Button>
          <Link to="/" className="block text-sm text-gray-500 hover:text-gray-300">
            Back to app
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 px-4 py-6 sm:px-6 sm:py-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold text-white truncate">Admin settings</h1>
          <Link to="/" className="text-sm text-gray-400 hover:text-white shrink-0">
            Back to app
          </Link>
        </div>

        <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-4 sm:p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Branding</h2>
            <p className="text-sm text-gray-400">
              Changes apply immediately, no rebuild or restart needed.
            </p>
          </div>

          <Input
            label="App name"
            value={form.appName}
            onChange={(e) => update('appName', e.target.value)}
          />
          <Input
            label="Tagline"
            value={form.tagline}
            onChange={(e) => update('tagline', e.target.value)}
          />
          <Input
            label="Description"
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
          />

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Accent color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.primaryColor}
                onChange={(e) => update('primaryColor', e.target.value)}
                className="h-10 w-14 rounded cursor-pointer bg-transparent border border-gray-600"
              />
              <Input
                value={form.primaryColor}
                onChange={(e) => update('primaryColor', e.target.value)}
                className="flex-1"
              />
            </div>
          </div>

          {[
            { field: 'logoIcon', label: 'Icon logo (used in the header)' },
            { field: 'logoFull', label: 'Full logo (icon + name)' },
          ].map(({ field, label }) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-300 mb-2">{label}</label>
              <div className="flex items-center gap-4">
                <img
                  src={previewUrl(form[field])}
                  alt=""
                  className="h-12 w-12 object-contain bg-gray-900 rounded border border-gray-700 p-1"
                />
                <input
                  type="file"
                  accept="image/svg+xml,image/png,image/jpeg,image/webp"
                  onChange={(e) => uploadLogo(field, e.target.files?.[0])}
                  disabled={uploading === field}
                  className="text-sm text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-700 file:px-3 file:py-1.5 file:text-white file:text-sm hover:file:bg-gray-600"
                />
              </div>
            </div>
          ))}

          <div className="pt-4 border-t border-gray-700">
            <h2 className="text-lg font-semibold text-white mb-1">Features</h2>
            <p className="text-sm text-gray-400 mb-4">
              Turn off anything you don't want offered on this instance. Hidden client-side; not a security boundary.
            </p>
            <div className="space-y-3">
              {FEATURE_LABELS.map(({ key, label, description }) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{label}</p>
                    <p className="text-xs text-gray-400">{description}</p>
                  </div>
                  <button
                    onClick={() => toggleFeature(key)}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                      form.features[key] ? 'bg-primary-600' : 'bg-gray-600'
                    }`}
                  >
                    <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform ${
                      form.features[key] ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-gray-700">
            <h2 className="text-lg font-semibold text-white mb-1">Admin access</h2>
            <p className="text-sm text-gray-400 mb-4">
              Hides this page behind a lock screen for anyone who doesn't have the admin token below. It's a
              deterrent, not a replacement for the token check - saving still always requires it.
            </p>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">Admin page enabled</p>
                <p className="text-xs text-gray-400">Turn off to hide the form from casual visitors</p>
              </div>
              <button
                onClick={() => update('adminPageEnabled', !form.adminPageEnabled)}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                  form.adminPageEnabled ? 'bg-primary-600' : 'bg-gray-600'
                }`}
              >
                <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform ${
                  form.adminPageEnabled ? 'translate-x-5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-700">
            <Input
              type="password"
              label="Admin token"
              helperText="Set as ADMIN_SETUP_TOKEN in the backend .env. Required to save."
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>

          <Button onClick={save} loading={saving} size="lg" className="w-full">
            Save changes
          </Button>
        </div>

        <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-4 sm:p-6 space-y-4 mt-6">
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Virtual backgrounds</h2>
            <p className="text-sm text-gray-400">
              Preset backgrounds offered to every participant, in addition to whatever they upload for themselves. Changes here apply immediately.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {backgroundPresets.map((preset) => (
              <div key={preset.id} className="relative aspect-video rounded-lg overflow-hidden border border-gray-700 group">
                <img src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeBackground(preset.id)}
                  className="absolute top-1 right-1 bg-black/70 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}

            <label className="aspect-video rounded-lg border-2 border-dashed border-gray-600 hover:border-gray-500 flex flex-col items-center justify-center gap-1 cursor-pointer text-gray-400 text-xs">
              {uploadingBackground ? 'Uploading...' : 'Add background'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={uploadingBackground}
                onChange={(e) => { addBackground(e.target.files?.[0]); e.target.value = ''; }}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Admin;

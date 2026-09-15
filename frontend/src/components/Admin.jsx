import { useState } from 'react';
import { Link } from 'react-router-dom';
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
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');

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

  return (
    <div className="min-h-screen bg-gray-900 px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Admin settings</h1>
          <Link to="/" className="text-sm text-gray-400 hover:text-white">
            Back to app
          </Link>
        </div>

        <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6 space-y-6">
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
      </div>
    </div>
  );
};

export default Admin;

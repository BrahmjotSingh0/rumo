import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Plus, Link2, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from './ui/Button';
import Input from './ui/Input';
import LanguageSwitcher from './ui/LanguageSwitcher';
import branding from '../config/branding';
import { useTranslation } from '../i18n/I18nProvider';
import api from '../utils/api';

const NAME_STORAGE_KEY = 'rumo_display_name';

const Home = () => {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [roomId, setRoomId] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const persistName = (value) => {
    setName(value);
    try {
      localStorage.setItem(NAME_STORAGE_KEY, value);
    } catch {
      // ignore - private browsing etc.
    }
  };

  // Accept either a bare room id or a full meeting link and pull the id out.
  const extractRoomId = (input) => {
    if (!input) return '';
    const urlMatch = input.match(/\/room\/([a-f0-9-]+)/i);
    if (urlMatch) return urlMatch[1];
    return input.trim();
  };

  const requireName = () => {
    if (!name.trim()) {
      toast.error(t('home.errorEnterName'));
      return false;
    }
    return true;
  };

  const createRoom = async () => {
    if (!requireName()) return;

    setCreating(true);
    try {
      const response = await api.post('/api/rooms', { title: 'Quick Meeting' });
      toast.success(t('home.roomCreated'));
      navigate(`/room/${response.data.data.id}`);
    } catch (error) {
      console.error('Error creating room:', error);
      toast.error(t('home.errorCreateFailed'));
    } finally {
      setCreating(false);
    }
  };

  const joinRoom = async () => {
    if (!requireName()) return;

    if (!roomId.trim()) {
      toast.error(t('home.errorEnterRoomId'));
      return;
    }

    const extractedRoomId = extractRoomId(roomId);
    if (!extractedRoomId) {
      toast.error(t('home.errorInvalidRoomId'));
      return;
    }

    setJoining(true);
    try {
      await api.get(`/api/rooms/${extractedRoomId}`);
      toast.success(t('home.joiningRoom'));
      navigate(`/room/${extractedRoomId}`);
    } catch (error) {
      console.error('Error joining room:', error);
      if (error.response?.status === 404) {
        toast.error(t('home.errorRoomNotFound'));
      } else {
        toast.error(t('home.errorJoinFailed'));
      }
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="relative z-10 px-6 py-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={branding.logoIcon} alt={branding.appName} className="h-9 w-9" />
            <span className="text-xl font-bold text-white">{branding.appName}</span>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-6xl font-bold text-white mb-4">{branding.appName}</h1>
            <p className="text-2xl text-gray-300 mb-2">{branding.tagline}</p>
            <p className="text-sm text-gray-500">{branding.description}</p>
          </div>

          <div className="max-w-md mx-auto mb-10">
            <Input
              placeholder={t('home.namePlaceholder')}
              value={name}
              onChange={(e) => persistName(e.target.value)}
              className="w-full bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 text-center"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-16">
            {/* Start Meeting Card */}
            <div className="bg-gradient-to-br from-primary-600/20 to-purple-600/20 backdrop-blur-xl border border-primary-500/30 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-primary-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Plus className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">{t('common.startMeeting')}</h3>
              <p className="text-gray-300 mb-6">{t('home.createCardDesc')}</p>
              <Button
                onClick={createRoom}
                loading={creating}
                size="lg"
                className="w-full bg-primary-600 hover:bg-primary-700"
              >
                <Video className="w-5 h-5 mr-2" />
                {t('home.startNewMeeting')}
              </Button>
            </div>

            {/* Join Meeting Card */}
            <div className="bg-gradient-to-br from-green-600/20 to-teal-600/20 backdrop-blur-xl border border-green-500/30 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-green-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Link2 className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">{t('common.joinMeeting')}</h3>
              <p className="text-gray-300 mb-6">{t('home.joinCardDesc')}</p>

              <div className="space-y-4">
                <Input
                  placeholder={t('home.roomInputPlaceholder')}
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="w-full bg-gray-800/50 border-gray-600 text-white placeholder-gray-400"
                />
                <Button
                  onClick={joinRoom}
                  loading={joining}
                  size="lg"
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  <UserCheck className="w-5 h-5 mr-2" />
                  {t('common.joinMeeting')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse-slow" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse-slow" />
      </div>
    </div>
  );
};

export default Home;

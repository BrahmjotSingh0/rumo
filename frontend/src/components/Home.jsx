import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Link2, UserRound, ShieldCheck, Users, Globe, Radio } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from './ui/Button';
import Input from './ui/Input';
import LanguageSwitcher from './ui/LanguageSwitcher';
import branding from '../config/branding';
import { useTranslation } from '../i18n/I18nProvider';
import api from '../utils/api';

const NAME_STORAGE_KEY = 'rumo_display_name';

const FEATURES = [
  { icon: Radio, titleKey: 'home.featureP2pTitle', descKey: 'home.featureP2pDesc' },
  { icon: Users, titleKey: 'home.featureGuestTitle', descKey: 'home.featureGuestDesc' },
  { icon: ShieldCheck, titleKey: 'home.featureHostTitle', descKey: 'home.featureHostDesc' },
  { icon: Globe, titleKey: 'home.featureOpenTitle', descKey: 'home.featureOpenDesc' },
];

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

  const handleJoinKeyDown = (e) => {
    if (e.key === 'Enter') joinRoom();
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 sm:px-6 py-4">
          <div className="flex items-center gap-2 min-w-0">
            <img src={branding.logoIcon} alt="" className="h-7 w-7 sm:h-8 sm:w-8 shrink-0" />
            <span className="text-base sm:text-lg font-semibold text-white truncate">{branding.appName}</span>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="px-4 sm:px-6 py-12 sm:py-20">
          <div className="max-w-md mx-auto text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-white text-balance">
              {branding.tagline}
            </h1>
            <p className="mt-3 text-sm sm:text-base text-gray-400">
              {branding.description}
            </p>
          </div>

          <div className="mt-8 max-w-md mx-auto bg-gray-800 border border-gray-700 rounded-xl p-5 sm:p-6">
            <Input
              icon={UserRound}
              placeholder={t('home.namePlaceholder')}
              value={name}
              onChange={(e) => persistName(e.target.value)}
              autoComplete="name"
            />

            <Button
              onClick={createRoom}
              loading={creating}
              size="lg"
              className="w-full mt-4"
            >
              <Video className="w-5 h-5 mr-2" />
              {t('home.startNewMeeting')}
            </Button>

            <div className="flex items-center gap-3 my-5" aria-hidden="true">
              <div className="flex-1 h-px bg-gray-700" />
              <span className="text-xs uppercase tracking-wide text-gray-500">{t('home.orDivider')}</span>
              <div className="flex-1 h-px bg-gray-700" />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  icon={Link2}
                  placeholder={t('home.roomInputPlaceholder')}
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  onKeyDown={handleJoinKeyDown}
                />
              </div>
              <Button
                onClick={joinRoom}
                loading={joining}
                variant="outline"
                size="lg"
                className="sm:w-auto w-full"
              >
                {t('home.joinButton')}
              </Button>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-gray-800 px-4 sm:px-6 py-12 sm:py-16">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t('home.featuresTitle')}
            </h2>
            <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8">
              {FEATURES.map((feature) => {
                const FeatureIcon = feature.icon;
                return (
                  <div key={feature.titleKey}>
                    <FeatureIcon className="w-5 h-5 text-primary-400" />
                    <h3 className="mt-3 font-medium text-white">{t(feature.titleKey)}</h3>
                    <p className="mt-1.5 text-sm text-gray-400 leading-relaxed">{t(feature.descKey)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-800 px-4 sm:px-6 py-6 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} {branding.appName}
      </footer>
    </div>
  );
};

export default Home;

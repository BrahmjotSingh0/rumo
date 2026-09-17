import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconVideo as Video, IconLink as Link2, IconUserCircle as UserRound, IconShieldCheck as ShieldCheck, IconUsers as Users, IconWorld as Globe, IconBroadcast as Radio, IconLock as Lock, IconChevronDown as ChevronDown, IconChevronUp as ChevronUp, IconCalendar as Calendar, IconCopy as Copy, IconCheck as Check } from '@tabler/icons-react'
import toast from 'react-hot-toast';
import Button from './ui/Button';
import Input from './ui/Input';
import LanguageSwitcher from './ui/LanguageSwitcher';
import UpdateBanner from './ui/UpdateBanner';
import branding, { DEFAULT_TAGLINE, DEFAULT_DESCRIPTION } from '../config/branding';
import { useTranslation } from '../i18n/I18nProvider';
import api from '../utils/api';
import { buildMeetingUrl, buildGoogleCalendarUrl, buildOutlookCalendarUrl, downloadIcsFile } from '../utils/calendar';

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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pin, setPin] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduledRoom, setScheduledRoom] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
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
    setScheduledRoom(null);
    try {
      const response = await api.post('/api/rooms', {
        title: 'Quick Meeting',
        password: pin.trim() || undefined,
        maxParticipants: maxParticipants ? parseInt(maxParticipants, 10) : undefined,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined
      });
      const room = response.data.data;

      if (scheduledAt) {
        // Scheduled for later - show the link + calendar options instead of
        // jumping straight into the room.
        setScheduledRoom(room);
        toast.success(t('home.roomScheduled'));
      } else {
        toast.success(t('home.roomCreated'));
        navigate(`/room/${room.id}`);
      }
    } catch (error) {
      console.error('Error creating room:', error);
      toast.error(t('home.errorCreateFailed'));
    } finally {
      setCreating(false);
    }
  };

  const copyScheduledLink = () => {
    if (!scheduledRoom) return;
    navigator.clipboard.writeText(buildMeetingUrl(scheduledRoom.id)).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => toast.error(t('home.errorCopyFailed')));
  };

  const scheduledCalendarEvent = () => ({
    title: `${branding.appName} meeting`,
    description: t('home.calendarEventDescription'),
    url: scheduledRoom ? buildMeetingUrl(scheduledRoom.id) : '',
    start: scheduledAt
  });

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

  // Only translate the tagline/description when they're still the untouched
  // default - a self-hoster's own custom branding copy is shown as-is.
  const tagline = branding.tagline === DEFAULT_TAGLINE ? t('home.defaultTagline') : branding.tagline;
  const description = branding.description === DEFAULT_DESCRIPTION ? t('home.defaultDescription') : branding.description;

  return (
    <div className="min-h-screen flex flex-col bg-gray-900">
      <UpdateBanner />
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
              {tagline}
            </h1>
            <p className="mt-3 text-sm sm:text-base text-gray-400">
              {description}
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

            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="mt-3 flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-300"
            >
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {t('home.advancedOptions')}
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-3">
                <Input
                  icon={Lock}
                  type="password"
                  placeholder={t('home.pinOptionalPlaceholder')}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  maxLength={50}
                />
                <Input
                  icon={Users}
                  type="number"
                  min={2}
                  max={100}
                  placeholder={t('home.maxParticipantsPlaceholder')}
                  value={maxParticipants}
                  onChange={(e) => setMaxParticipants(e.target.value)}
                />
                <Input
                  icon={Calendar}
                  type="datetime-local"
                  label={t('home.scheduleLabel')}
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>
            )}

            <Button
              onClick={createRoom}
              loading={creating}
              size="lg"
              className="w-full mt-4"
            >
              <Video className="w-5 h-5 mr-2" />
              {scheduledAt ? t('home.scheduleMeeting') : t('home.startNewMeeting')}
            </Button>

            {scheduledRoom && (
              <div className="mt-4 p-4 rounded-lg bg-gray-900 border border-gray-700">
                <p className="text-sm text-gray-300">{t('home.roomScheduledHelp')}</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 text-xs text-gray-400 truncate">{buildMeetingUrl(scheduledRoom.id)}</code>
                  <button
                    type="button"
                    onClick={copyScheduledLink}
                    className="shrink-0 text-gray-400 hover:text-white"
                    aria-label={t('home.copyLink')}
                  >
                    {linkCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={buildGoogleCalendarUrl(scheduledCalendarEvent())}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-gray-300 hover:text-white"
                  >
                    {t('home.addToGoogleCalendar')}
                  </a>
                  <a
                    href={buildOutlookCalendarUrl(scheduledCalendarEvent())}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-gray-300 hover:text-white"
                  >
                    {t('home.addToOutlook')}
                  </a>
                  <button
                    type="button"
                    onClick={() => downloadIcsFile(scheduledCalendarEvent())}
                    className="text-xs px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-gray-300 hover:text-white"
                  >
                    {t('home.downloadIcs')}
                  </button>
                </div>
              </div>
            )}

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

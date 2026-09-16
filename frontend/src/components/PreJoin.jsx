import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { IconMicrophone as Mic, IconMicrophoneOff as MicOff, IconVideo as Video, IconVideoOff as VideoOff, IconSettings as Settings, IconLock as Lock } from '@tabler/icons-react'
import toast from 'react-hot-toast'
import branding from '../config/branding'
import { useTranslation } from '../i18n/I18nProvider'
import api from '../utils/api'

const NAME_STORAGE_KEY = 'rumo_display_name'

const PreJoin = () => {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()

  // Embedded via embed.js/RumoMeetExternalAPI (see docs/EMBEDDING.md) - a
  // host page can pass ?embed=1&name=X to skip typing a name here and to
  // carry embed mode through to the meeting itself.
  const isEmbedded = searchParams.get('embed') === '1' && branding.features.embedding !== false
  const nameFromQuery = searchParams.get('name') || ''

  const [name, setName] = useState(() => {
    if (nameFromQuery) return nameFromQuery
    try {
      return localStorage.getItem(NAME_STORAGE_KEY) || ''
    } catch {
      return ''
    }
  })
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [stream, setStream] = useState(null)
  const [loading, setLoading] = useState(false)
  const [willBeHost, setWillBeHost] = useState(false)
  const [needsPin, setNeedsPin] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')

  const videoRef = useRef()

  // Confirm the room exists (and whether it's empty, i.e. this join would
  // become host) before letting anyone into the media/join flow.
  useEffect(() => {
    const fetchRoomInfo = async () => {
      try {
        const response = await api.get(`/api/rooms/${roomId}`)
        setWillBeHost((response.data.data?.participantCount || 0) === 0)
        setNeedsPin(!!response.data.data?.hasPassword)
      } catch (error) {
        console.error('Failed to fetch room info:', error)
        toast.error(t('home.errorRoomNotFound'))
        navigate('/', { replace: true })
      }
    }

    if (roomId) {
      fetchRoomInfo()
    }
  }, [roomId, navigate, t])

  useEffect(() => {
    initializePreview()
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [audioEnabled, videoEnabled])

  const initializePreview = async () => {
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }

      const constraints = {
        video: videoEnabled ? {
          width: { ideal: 640 },
          height: { ideal: 480 }
        } : false,
        audio: audioEnabled
      }

      const newStream = await navigator.mediaDevices.getUserMedia(constraints)
      setStream(newStream)

      if (videoRef.current) {
        videoRef.current.srcObject = newStream
      }
    } catch (error) {
      console.error('Error accessing media:', error)
    }
  }

  const persistName = (value) => {
    setName(value)
    try {
      localStorage.setItem(NAME_STORAGE_KEY, value)
    } catch {
      // ignore - private browsing etc.
    }
  }

  const joinMeeting = async () => {
    if (!name.trim()) return
    if (needsPin && !pin.trim()) {
      setPinError(t('prejoin.pinRequired'))
      return
    }

    setLoading(true)
    setPinError('')

    if (needsPin) {
      try {
        await api.post(`/api/rooms/${roomId}/verify-pin`, { pin: pin.trim() })
      } catch (error) {
        setLoading(false)
        if (error.response?.status === 401) {
          setPinError(t('prejoin.pinIncorrect'))
        } else {
          toast.error(t('prejoin.pinIncorrect'))
        }
        return
      }
    }

    // Media + name preferences read by MeetingPro once inside the call.
    sessionStorage.setItem('meetingPreferences', JSON.stringify({
      name: name.trim(),
      audio: audioEnabled,
      video: videoEnabled,
      pin: needsPin ? pin.trim() : undefined
    }))

    navigate(`/m/${roomId}${isEmbedded ? '?embed=1' : ''}`, { state: { fromPreJoin: true } })
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary-500/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-4xl w-full relative z-10">
        <div className="text-center mb-8">
          <div className="flex justify-center items-center gap-3 mb-6">
            <img src={branding.logoIcon} alt={branding.appName} className="h-10 w-10" />
            <span className="text-2xl font-bold text-white">{branding.appName}</span>
          </div>
          <p className="text-slate-400 text-lg">{t('prejoin.readyToJoin')}</p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl p-6 md:p-8 mb-6">
          <div className="grid md:grid-cols-2 gap-8 md:items-start">
            {/* Video Preview */}
            <div className="space-y-6 flex flex-col h-full">
              <h3 className="text-xl font-semibold text-white flex items-center gap-3">
                <div className="p-2 bg-primary-500/20 rounded-lg">
                  <Video size={20} className="text-primary-400" />
                </div>
                {t('prejoin.cameraPreview')}
              </h3>
              <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                <div className="absolute inset-0 bg-slate-800 rounded-2xl overflow-hidden shadow-2xl border border-slate-700/50 flex items-center justify-center">
                  {videoEnabled ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      muted
                      playsInline
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-center animate-pulse">
                        <div className="w-16 h-16 bg-slate-600 rounded-full flex items-center justify-center mx-auto mb-4">
                          <VideoOff size={32} className="text-slate-400" />
                        </div>
                        <p className="text-slate-400 font-medium">{t('prejoin.cameraOff')}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="space-y-4">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => persistName(e.target.value)}
                    placeholder={t('prejoin.namePlaceholder')}
                    maxLength={150}
                    className="w-full px-4 py-4 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-400">{t('prejoin.nameHelp')}</p>
                    {willBeHost && (
                      <div className="px-3 py-1 rounded-full text-xs font-medium bg-primary-600 text-white shadow-lg">
                        {t('prejoin.host')}
                      </div>
                    )}
                  </div>

                  {needsPin && (
                    <div>
                      <div className="relative">
                        <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="password"
                          value={pin}
                          onChange={(e) => { setPin(e.target.value); setPinError('') }}
                          placeholder={t('prejoin.pinPlaceholder')}
                          maxLength={50}
                          className="w-full pl-11 pr-4 py-4 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      {pinError && <p className="text-sm text-red-400 mt-2">{pinError}</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="space-y-8 flex flex-col h-full justify-between">
              <div className="space-y-6">
                <h3 className="text-xl font-semibold text-white flex items-center gap-3">
                  <div className="p-2 bg-purple-500/20 rounded-lg">
                    <Settings size={20} className="text-purple-400" />
                  </div>
                  {t('prejoin.mediaSettings')}
                </h3>

                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-slate-800/30 hover:bg-slate-700/50 rounded-xl p-4 border border-slate-600/30 transition-all duration-200 group">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg transition-colors ${
                        audioEnabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
                      </div>
                      <span className="text-white font-medium">{t('prejoin.microphone')}</span>
                    </div>
                    <button
                      onClick={() => setAudioEnabled(!audioEnabled)}
                      className={`relative w-12 h-6 rounded-full transition-all duration-200 ${
                        audioEnabled ? 'bg-primary-600 shadow-lg shadow-primary-600/25' : 'bg-slate-600'
                      }`}
                    >
                      <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform duration-200 shadow-lg ${
                        audioEnabled ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between bg-slate-800/30 hover:bg-slate-700/50 rounded-xl p-4 border border-slate-600/30 transition-all duration-200 group">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg transition-colors ${
                        videoEnabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
                      </div>
                      <span className="text-white font-medium">{t('prejoin.camera')}</span>
                    </div>
                    <button
                      onClick={() => setVideoEnabled(!videoEnabled)}
                      className={`relative w-12 h-6 rounded-full transition-all duration-200 ${
                        videoEnabled ? 'bg-primary-600 shadow-lg shadow-primary-600/25' : 'bg-slate-600'
                      }`}
                    >
                      <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform duration-200 shadow-lg ${
                        videoEnabled ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => navigate('/')}
                  className="flex-1 px-6 py-4 bg-slate-700/50 hover:bg-slate-600/50 text-white font-medium rounded-xl transition-all duration-200 hover:scale-105 shadow-lg border border-slate-600/50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={joinMeeting}
                  disabled={!name.trim() || loading || (needsPin && !pin.trim())}
                  className="flex-1 px-6 py-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-all duration-200 hover:scale-105 shadow-lg shadow-primary-600/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t('prejoin.joining')}
                    </>
                  ) : (
                    t('common.joinMeeting')
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PreJoin

import { useState, useEffect } from 'react'
import { Mic, MicOff, Video, VideoOff, Monitor, Phone, Settings, Hand, Smile, Circle, Square, PenLine, MoreHorizontal, Link2 } from 'lucide-react'
import branding from '../../config/branding'

const REACTION_EMOJI = ['👍', '👏', '❤️', '😂', '🎉', '👋']

const MeetingControls = ({
  audioEnabled,
  videoEnabled,
  screenSharing,
  showScreenShareDropdown,
  showControls,
  toggleAudio,
  toggleVideo,
  canScreenShare = true,
  toggleScreenShare,
  stopScreenShare,
  copyInviteLink,
  setSettingsOpen,
  leaveMeeting,
  handRaised = false,
  onToggleHand,
  onSendReaction,
  isRecording = false,
  onToggleRecording,
  onToggleWhiteboard,
  isMobile,
  settings
}) => {
  const [showReactions, setShowReactions] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const isLight = settings?.theme === 'light'
  const { features } = branding

  useEffect(() => {
    if (!showMore) return
    const handleClick = (e) => {
      if (!e.target.closest('.more-menu-container')) setShowMore(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMore])

  const controlBg = isLight 
    ? 'bg-white/90 backdrop-blur-xl border-gray-200' 
    : 'bg-gray-900/80 backdrop-blur-xl border-gray-800/50'
    
  const buttonBg = isLight
    ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
    : 'bg-gray-800/80 hover:bg-gray-700 text-white'
    
  const dropdownBg = isLight
    ? 'bg-white/95 backdrop-blur-xl border-gray-200'
    : 'bg-gray-800/95 backdrop-blur-xl border-gray-600/50'
    
  const dropdownText = isLight ? 'text-gray-900' : 'text-white'
  const dropdownHover = isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-700/50'
  
  return (
    <div className={`${isMobile ? 'w-full py-3 px-3' : 'fixed bottom-4 md:bottom-6 left-1/2 transform -translate-x-1/2'} z-[100] transition-all duration-300 ${
      showControls ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
    }`}>
      <div className={`flex items-center justify-center ${isMobile ? 'gap-2' : 'gap-2 md:gap-3'} ${isMobile ? '' : `${controlBg} px-4 md:px-6 py-3 md:py-4 rounded-2xl border shadow-2xl`}`}>
        <button
          onClick={toggleAudio}
          className={`${isMobile ? 'w-14 h-14' : 'w-12 h-12 md:w-14 md:h-14'} rounded-full md:rounded-xl transition-all duration-200 flex items-center justify-center group relative overflow-hidden ${
            audioEnabled 
              ? `${buttonBg} shadow-lg hover:shadow-xl active:scale-95` 
              : 'bg-red-500/90 hover:bg-red-600 text-white shadow-lg shadow-red-500/25 hover:shadow-red-500/40 active:scale-95'
          }`}
          title={audioEnabled ? 'Mute' : 'Unmute'}
        >
          {!isMobile && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />}
          {audioEnabled ? <Mic size={isMobile ? 22 : 18} /> : <MicOff size={isMobile ? 22 : 18} />}
        </button>
        
        <button
          onClick={toggleVideo}
          className={`${isMobile ? 'w-14 h-14' : 'w-12 h-12 md:w-14 md:h-14'} rounded-full md:rounded-xl transition-all duration-200 flex items-center justify-center group relative overflow-hidden ${
            videoEnabled 
              ? `${buttonBg} shadow-lg hover:shadow-xl active:scale-95` 
              : 'bg-red-500/90 hover:bg-red-600 text-white shadow-lg shadow-red-500/25 hover:shadow-red-500/40 active:scale-95'
          }`}
          title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
        >
          {!isMobile && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />}
          {videoEnabled ? <Video size={isMobile ? 22 : 18} /> : <VideoOff size={isMobile ? 22 : 18} />}
        </button>
        
        {/* Flip camera button - disabled for now, will fix later */}
        {/* {isMobile && videoEnabled && (
          <button
            onClick={flipCamera}
            className={`w-14 h-14 rounded-full transition-all duration-200 flex items-center justify-center group relative overflow-hidden ${buttonBg} shadow-lg active:scale-95`}
            title="Flip camera"
          >
            <RefreshCw size={22} />
          </button>
        )} */}
        
        {features.screenShare && (
          <div className="relative screen-share-container">
            <button
              onClick={canScreenShare ? toggleScreenShare : undefined}
              disabled={!canScreenShare}
              className={`${isMobile ? 'w-14 h-14' : 'w-12 h-12 md:w-14 md:h-14'} rounded-full md:rounded-xl transition-all duration-200 flex items-center justify-center group relative overflow-hidden ${
                !canScreenShare ? 'opacity-40 cursor-not-allowed' : ''
              } ${
                screenSharing
                  ? 'bg-blue-500/90 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 active:scale-95'
                  : `${buttonBg} shadow-lg hover:shadow-xl active:scale-95`
              }`}
              title={!canScreenShare ? 'Screen sharing has been disabled by the host' : screenSharing ? 'Screen share options' : 'Share screen'}
            >
              {!isMobile && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />}
              <Monitor size={isMobile ? 22 : 18} />
            </button>

            {showScreenShareDropdown && (
              <div className={`absolute ${isMobile ? 'bottom-full mb-2' : 'bottom-full mb-3'} left-1/2 transform -translate-x-1/2 ${dropdownBg} rounded-xl shadow-2xl border py-2 min-w-[140px] animate-in slide-in-from-bottom-2`}>
                <button
                  onClick={stopScreenShare}
                  className={`w-full px-4 py-3 text-left text-sm ${dropdownText} ${dropdownHover} flex items-center gap-3 transition-colors active:${dropdownHover}`}
                >
                  <Monitor size={16} />
                  Stop sharing
                </button>
              </div>
            )}
          </div>
        )}

        {(features.reactions || features.raiseHand) && (
          <div className="relative">
            <button
              onClick={() => setShowReactions((v) => !v)}
              className={`${isMobile ? 'w-14 h-14' : 'w-12 h-12 md:w-14 md:h-14'} rounded-full md:rounded-xl transition-all duration-200 flex items-center justify-center group relative overflow-hidden ${
                handRaised
                  ? 'bg-yellow-500/90 hover:bg-yellow-600 text-white shadow-lg shadow-yellow-500/25 active:scale-95'
                  : `${buttonBg} shadow-lg hover:shadow-xl active:scale-95`
              }`}
              title="Reactions"
            >
              {handRaised ? <Hand size={isMobile ? 22 : 18} /> : <Smile size={isMobile ? 22 : 18} />}
            </button>

            {showReactions && (
              <div className={`absolute ${isMobile ? 'bottom-full mb-2' : 'bottom-full mb-3'} left-1/2 transform -translate-x-1/2 ${dropdownBg} rounded-xl shadow-2xl border p-2 min-w-max`}>
                {features.raiseHand && (
                  <button
                    onClick={() => { onToggleHand?.(); setShowReactions(false) }}
                    className={`w-full flex items-center gap-2 px-3 py-2 mb-1 rounded-lg text-sm whitespace-nowrap ${dropdownText} ${dropdownHover} transition-colors`}
                  >
                    <Hand size={16} className={handRaised ? 'text-yellow-500' : ''} />
                    {handRaised ? 'Lower hand' : 'Raise hand'}
                  </button>
                )}
                {features.reactions && (
                  <div className="flex gap-1">
                    {REACTION_EMOJI.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => { onSendReaction?.(emoji); setShowReactions(false) }}
                        className={`text-xl w-9 h-9 flex items-center justify-center rounded-lg ${dropdownHover} transition-colors`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {(features.whiteboard || features.localRecording) && (
          <div className="relative more-menu-container">
            <button
              onClick={() => setShowMore((v) => !v)}
              className={`${isMobile ? 'w-14 h-14' : 'w-12 h-12 md:w-14 md:h-14'} rounded-full md:rounded-xl transition-all duration-200 flex items-center justify-center group relative overflow-hidden ${
                isRecording ? 'ring-2 ring-red-500/70' : ''
              } ${buttonBg} shadow-lg hover:shadow-xl active:scale-95`}
              title="More options"
            >
              <MoreHorizontal size={isMobile ? 22 : 18} />
            </button>

            {showMore && (
              <div className={`absolute ${isMobile ? 'bottom-full mb-2' : 'bottom-full mb-3'} right-0 ${dropdownBg} rounded-xl shadow-2xl border py-2 min-w-[220px] z-10`}>
                {features.whiteboard && (
                  <button
                    onClick={() => { onToggleWhiteboard?.(); setShowMore(false) }}
                    className={`w-full px-4 py-3 text-left text-sm ${dropdownText} ${dropdownHover} flex items-center gap-3 transition-colors`}
                  >
                    <PenLine size={16} />
                    Whiteboard
                  </button>
                )}
                {features.localRecording && (
                  <button
                    onClick={() => { onToggleRecording?.(); setShowMore(false) }}
                    className={`w-full px-4 py-3 text-left text-sm ${dropdownText} ${dropdownHover} flex items-center gap-3 transition-colors`}
                  >
                    {isRecording ? <Square size={16} className="text-red-500" /> : <Circle size={16} />}
                    {isRecording ? 'Stop recording' : 'Record my camera & mic'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <button
          onClick={copyInviteLink}
          className={`${isMobile ? 'w-14 h-14' : 'w-12 h-12 md:w-14 md:h-14'} rounded-full md:rounded-xl ${buttonBg} transition-all duration-200 flex items-center justify-center group relative overflow-hidden shadow-lg hover:shadow-xl active:scale-95`}
          title="Copy invite link"
        >
          {!isMobile && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />}
          <Link2 size={isMobile ? 22 : 18} />
        </button>

        <button
          onClick={() => setSettingsOpen(true)}
          className={`${isMobile ? 'w-14 h-14' : 'w-12 h-12 md:w-14 md:h-14'} rounded-full md:rounded-xl ${buttonBg} transition-all duration-200 flex items-center justify-center group relative overflow-hidden shadow-lg hover:shadow-xl active:scale-95`}
          title="Settings"
        >
          {!isMobile && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />}
          <Settings size={isMobile ? 22 : 18} />
        </button>

        <button
          onClick={leaveMeeting}
          className={`${isMobile ? 'w-14 h-14' : 'w-12 h-12 md:w-14 md:h-14'} rounded-full md:rounded-xl bg-red-500/90 hover:bg-red-600 text-white transition-all duration-200 flex items-center justify-center group relative overflow-hidden shadow-lg shadow-red-500/25 hover:shadow-red-500/40 active:scale-95`}
          title="Leave meeting"
        >
          {!isMobile && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />}
          <Phone size={isMobile ? 22 : 18} className="rotate-[135deg]" />
        </button>
      </div>
    </div>
  )
}

export default MeetingControls

import { Mic, MicOff, Video, VideoOff, Monitor, Phone, Users, Settings, RefreshCw } from 'lucide-react'

const MeetingControls = ({
  audioEnabled,
  videoEnabled,
  screenSharing,
  showScreenShareDropdown,
  showControls,
  toggleAudio,
  toggleVideo,
  flipCamera,
  toggleScreenShare,
  stopScreenShare,
  copyInviteLink,
  setSettingsOpen,
  leaveMeeting,
  isMobile,
  settings
}) => {
  const isLight = settings?.theme === 'light'
  
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
        
        <div className="relative screen-share-container">
          <button
            onClick={toggleScreenShare}
            className={`${isMobile ? 'w-14 h-14' : 'w-12 h-12 md:w-14 md:h-14'} rounded-full md:rounded-xl transition-all duration-200 flex items-center justify-center group relative overflow-hidden ${
              screenSharing 
                ? 'bg-blue-500/90 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 active:scale-95' 
                : `${buttonBg} shadow-lg hover:shadow-xl active:scale-95`
            }`}
            title={screenSharing ? 'Screen share options' : 'Share screen'}
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
        
        <button
          onClick={copyInviteLink}
          className={`${isMobile ? 'w-14 h-14' : 'w-12 h-12 md:w-14 md:h-14'} rounded-full md:rounded-xl ${buttonBg} transition-all duration-200 flex items-center justify-center group relative overflow-hidden shadow-lg hover:shadow-xl active:scale-95`}
          title="Invite participants"
        >
          {!isMobile && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />}
          <Users size={isMobile ? 22 : 18} />
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

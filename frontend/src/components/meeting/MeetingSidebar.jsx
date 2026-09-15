import { Mic, MicOff, Video, VideoOff, Users, MessageCircle, X, Crown, Shield, MoreVertical } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import ParticipantContextMenu from './components/ParticipantContextMenu'
import HostSettings from './components/HostSettings'

const MeetingSidebar = ({
  sidebarOpen,
  setSidebarOpen,
  activeTab,
  setActiveTab,
  participants,
  userName,
  userProfilePicture,
  isHost,
  userRole, // Add user role
  audioEnabled,
  videoEnabled,
  messages,
  newMessage,
  setNewMessage,
  sendMessage,
  isMobile,
  settings,
  socket, // We'll need this for emitting events
  roomId // We'll need this for socket events
}) => {
  const [contextMenu, setContextMenu] = useState(null)
  const menuOpeningRef = useRef(false)
  const [roomSettings, setRoomSettings] = useState({
    allowChat: true,
    isPrivate: false,
    allMuted: false,
    allCamerasOff: false,
    allScreenShareOff: false
  })

  // Listen for room setting changes from backend
  useEffect(() => {
    if (!socket) return

    const handleChatStatusChanged = ({ enabled }) => {
      setRoomSettings(prev => ({ ...prev, allowChat: enabled }))
    }

    const handleRoomTypeChanged = ({ isPrivate }) => {
      setRoomSettings(prev => ({ ...prev, isPrivate }))
    }

    const handleRoomSettings = (settings) => {
      // Received initial room settings when joining
      setRoomSettings(prev => ({
        ...prev,
        allowChat: settings.chatEnabled !== undefined ? settings.chatEnabled : prev.allowChat,
        isPrivate: settings.isPrivate !== undefined ? settings.isPrivate : prev.isPrivate,
        allMuted: settings.allMuted !== undefined ? settings.allMuted : prev.allMuted,
        allCamerasOff: settings.allCamerasOff !== undefined ? settings.allCamerasOff : prev.allCamerasOff,
        allScreenShareOff: settings.allScreenSharesOff !== undefined ? settings.allScreenSharesOff : prev.allScreenShareOff
      }))
    }

    const handleAllParticipantsMuted = ({ enabled }) => {
      setRoomSettings(prev => ({ ...prev, allMuted: enabled }))
    }

    const handleAllCamerasDisabled = ({ enabled }) => {
      setRoomSettings(prev => ({ ...prev, allCamerasOff: enabled }))
    }

    const handleAllScreenSharesDisabled = ({ enabled }) => {
      setRoomSettings(prev => ({ ...prev, allScreenShareOff: enabled }))
    }

    socket.on('chat-status-changed', handleChatStatusChanged)
    socket.on('room-type-changed', handleRoomTypeChanged)
    socket.on('room-settings', handleRoomSettings)
    socket.on('all-participants-muted', handleAllParticipantsMuted)
    socket.on('all-cameras-disabled', handleAllCamerasDisabled)
    socket.on('all-screenshares-disabled', handleAllScreenSharesDisabled)

    return () => {
      socket.off('chat-status-changed', handleChatStatusChanged)
      socket.off('room-type-changed', handleRoomTypeChanged)
      socket.off('room-settings', handleRoomSettings)
      socket.off('all-participants-muted', handleAllParticipantsMuted)
      socket.off('all-cameras-disabled', handleAllCamerasDisabled)
      socket.off('all-screenshares-disabled', handleAllScreenSharesDisabled)
    }
  }, [socket])

  const handleContextMenu = (e, participant) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isHost && userRole !== 'co-host') return // Only host/co-host can see context menu
    
    setContextMenu({
      participant,
      position: { x: e.clientX, y: e.clientY }
    })
  }

  const handleThreeDotsClick = (e, participant) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Prevent double-click issues
    if (menuOpeningRef.current) return
    
    if (!isHost && userRole !== 'co-host') return
    
    // If menu is already open for this participant, close it
    if (contextMenu?.participant?.socketId === participant.socketId) {
      setContextMenu(null)
      return
    }
    
    // Set flag to prevent rapid re-clicks
    menuOpeningRef.current = true
    
    // Get button position for menu placement
    const rect = e.currentTarget.getBoundingClientRect()
    const newContextMenu = {
      participant,
      position: { 
        x: rect.left, 
        y: rect.bottom + 5 // Position menu below the button
      }
    }
    setContextMenu(newContextMenu)
    
    // Reset flag after a short delay
    setTimeout(() => {
      menuOpeningRef.current = false
    }, 300)
  }

  const closeContextMenu = () => {
    setContextMenu(null)
  }

  // Host control actions
  const handleMuteParticipant = (participant) => {
    if (socket) {
      socket.emit('mute-participant', { roomId, targetSocketId: participant.socketId })
    }
  }

  const handleDisableVideo = (participant) => {
    if (socket) {
      socket.emit('disable-video', { roomId, targetSocketId: participant.socketId })
    }
  }

  const handleStopScreenShare = (participant) => {
    if (socket) {
      socket.emit('stop-screenshare', { roomId, targetSocketId: participant.socketId })
    }
  }

  const handleMakeCoHost = (participant) => {
    if (socket) {
      socket.emit('make-cohost', { roomId, targetSocketId: participant.socketId })
    }
  }

  const handleRemoveCoHost = (participant) => {
    if (socket) {
      socket.emit('remove-cohost', { roomId, targetSocketId: participant.socketId })
    }
  }

  const handleKick = (participant) => {
    if (socket && confirm(`Remove ${participant.name} from the meeting?`)) {
      socket.emit('kick-participant', { roomId, targetSocketId: participant.socketId })
    }
  }

  // Host settings actions
  const handleMuteAll = () => {
    if (socket) {
      const newValue = !roomSettings.allMuted
      socket.emit('mute-all', { roomId, enabled: newValue })
      setRoomSettings(prev => ({ ...prev, allMuted: newValue }))
    }
  }

  const handleToggleChat = () => {
    if (socket) {
      const newValue = !roomSettings.allowChat
      socket.emit('toggle-chat', { roomId, enabled: newValue })
      setRoomSettings(prev => ({ ...prev, allowChat: newValue }))
    }
  }

  const handleToggleRoomType = () => {
    if (socket) {
      const newValue = !roomSettings.isPrivate
      socket.emit('set-room-type', { roomId, isPrivate: newValue })
      setRoomSettings(prev => ({ ...prev, isPrivate: newValue }))
    }
  }

  const handleDisableAllCameras = () => {
    if (socket) {
      const newValue = !roomSettings.allCamerasOff
      socket.emit('disable-all-cameras', { roomId, enabled: newValue })
      setRoomSettings(prev => ({ ...prev, allCamerasOff: newValue }))
    }
  }

  const handleDisableAllScreenShares = () => {
    if (socket) {
      const newValue = !roomSettings.allScreenShareOff
      socket.emit('disable-all-screenshares', { roomId, enabled: newValue })
      setRoomSettings(prev => ({ ...prev, allScreenShareOff: newValue }))
    }
  }

  if (!sidebarOpen) return null

  const isLight = settings?.theme === 'light'
  const bgClass = isLight ? 'bg-white/95' : 'bg-gray-900/95'
  const borderClass = isLight ? 'border-gray-200' : 'border-gray-800/50'
  const headerBgClass = isLight ? 'from-gray-50/50 to-white/50' : 'from-gray-800/50 to-gray-900/50'
  const textClass = isLight ? 'text-gray-900' : 'text-white'
  const textSecondaryClass = isLight ? 'text-gray-600' : 'text-gray-400'
  const itemBgClass = isLight ? 'bg-gray-100' : 'bg-gray-700'
  const chatBgClass = isLight ? 'bg-gray-50' : 'bg-gray-700'
  const inputBgClass = isLight ? 'bg-gray-100' : 'bg-gray-700'
  const buttonBgClass = isLight ? 'bg-blue-600' : 'bg-blue-600'
  const activeTabClass = isLight ? 'bg-blue-600 text-white' : 'bg-blue-600/90 text-white'
  const inactiveTabClass = isLight 
    ? `${textClass} hover:bg-gray-100 hover:${textClass}` 
    : 'text-gray-300 hover:bg-gray-800/50 hover:text-white'
  const hoverClass = isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-800/50'

  return (
    <div className={`${isMobile ? `absolute inset-0 z-40 ${bgClass} backdrop-blur-xl` : 'relative'} w-full ${!isMobile ? 'max-w-sm' : ''} ${bgClass} backdrop-blur-xl ${!isMobile ? `border-l ${borderClass}` : ''} flex flex-col shadow-2xl`}>
      {/* Sidebar Header */}
      <div className={`p-4 md:p-6 border-b ${borderClass} bg-gradient-to-r ${headerBgClass}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`${textClass} font-semibold text-lg`}>Meeting Info</h2>
          {/* Only show close button on mobile/tablet - hidden on desktop (md and above) */}
          <button 
            onClick={() => isMobile && setSidebarOpen(false)}
            className={`md:hidden p-2 ${hoverClass} rounded-xl ${textSecondaryClass} hover:${textClass} transition-all duration-200`}
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('participants')}
            className={`flex-1 py-3 px-4 text-sm font-medium rounded-xl transition-all duration-200 ${
              activeTab === 'participants' 
                ? `${activeTabClass} shadow-lg` 
                : inactiveTabClass
            }`}
          >
            <Users size={14} className="inline mr-2" />
            People ({participants.length + 1})
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-3 px-4 text-sm font-medium rounded-xl transition-all duration-200 ${
              activeTab === 'chat' 
                ? `${activeTabClass} shadow-lg` 
                : inactiveTabClass
            }`}
          >
            <MessageCircle size={14} className="inline mr-2" />
            Chat
          </button>
        </div>
      </div>

      {/* Sidebar Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'participants' ? (
          <div className="p-4 space-y-3 overflow-y-auto h-full">
            {/* Host Settings - Show for host or co-host */}
            {(isHost || userRole === 'co-host') && (
              <HostSettings
                roomSettings={roomSettings}
                onMuteAll={handleMuteAll}
                onToggleChat={handleToggleChat}
                onToggleRoomType={handleToggleRoomType}
                onDisableAllCameras={handleDisableAllCameras}
                onDisableAllScreenShares={handleDisableAllScreenShares}
                settings={settings}
              />
            )}

            {/* Current User */}
            <div className={`flex items-center justify-between p-3 ${itemBgClass} rounded-lg`}>
              <div className="flex items-center space-x-3">
                {userProfilePicture ? (
                  <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-blue-500">
                    <img src={userProfilePicture} alt={userName} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-medium">{userName?.charAt(0)?.toUpperCase()}</span>
                  </div>
                )}
                <div>
                  <p className={`${textClass} font-medium`}>{userName} (You)</p>
                  {isHost && <p className="text-blue-500 text-xs flex items-center gap-1"><Crown size={12} /> Host</p>}
                  {!isHost && userRole === 'co-host' && <p className="text-purple-500 text-xs flex items-center gap-1"><Shield size={12} /> Co-Host</p>}
                </div>
              </div>
              <div className="flex items-center space-x-1">
                {audioEnabled ? <Mic size={16} className="text-green-500" /> : <MicOff size={16} className="text-red-500" />}
                {videoEnabled ? <Video size={16} className="text-green-500" /> : <VideoOff size={16} className="text-red-500" />}
              </div>
            </div>

            {/* Other Participants */}
            {participants.map(participant => {
              const isCoHost = participant.role === 'co-host'
              return (
              <div 
                key={participant.socketId} 
                className={`flex items-center justify-between p-3 ${itemBgClass} rounded-lg ${(isHost || userRole === 'co-host') ? 'cursor-context-menu' : ''} transition-all hover:ring-2 hover:ring-blue-500/30`}
                onContextMenu={(e) => handleContextMenu(e, participant)}
              >
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  {participant.profilePicture ? (
                    <div className={`w-8 h-8 rounded-full overflow-hidden border-2 ${isCoHost ? 'border-purple-500' : 'border-gray-500'} flex-shrink-0`}>
                      <img src={participant.profilePicture} alt={participant.name} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className={`w-8 h-8 ${isCoHost ? 'bg-purple-600' : isLight ? 'bg-gray-400' : 'bg-gray-600'} rounded-full flex items-center justify-center flex-shrink-0`}>
                      <span className="text-white text-sm font-medium">{participant.name?.charAt(0)?.toUpperCase()}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`${textClass} font-medium truncate`}>{participant.name}</p>
                    {participant.isHost && <p className="text-blue-500 text-xs flex items-center gap-1"><Crown size={12} /> Host</p>}
                    {isCoHost && <p className="text-purple-500 text-xs flex items-center gap-1"><Shield size={12} /> Co-Host</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    {participant.audioEnabled ? <Mic size={16} className="text-green-500" /> : <MicOff size={16} className="text-red-500" />}
                    {participant.videoEnabled ? <Video size={16} className="text-green-500" /> : <VideoOff size={16} className="text-red-500" />}
                  </div>
                  {isHost && (
                    <button
                      onClick={(e) => handleThreeDotsClick(e, participant)}
                      className={`p-1.5 ${hoverClass} rounded-lg ${textSecondaryClass} hover:${textClass} transition-all`}
                      title="Participant options"
                    >
                      <MoreVertical size={18} />
                    </button>
                  )}
                </div>
              </div>
            )})}
          </div>
        ) : (
          /* Chat Tab */
          <div className="flex flex-col h-full">
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {messages.map(message => (
                <div key={message.id} className={`${chatBgClass} rounded-lg p-3`}>
                  <div className="flex items-start gap-2 mb-2">
                    {message.profilePicture ? (
                      <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 border border-blue-400">
                        <img src={message.profilePicture} alt={message.userName} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-medium">{message.userName?.charAt(0)?.toUpperCase()}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-blue-500 text-sm font-medium truncate">{message.userName}</span>
                        <span className={`${textSecondaryClass} text-xs flex-shrink-0 ml-2`}>{new Date(message.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className={`${textClass} text-sm break-words`}>{message.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Chat Input - Only show if chat is enabled */}
            {roomSettings.allowChat ? (
              <div className={`p-4 border-t ${borderClass}`}>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className={`flex-1 ${inputBgClass} ${textClass} px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    onKeyPress={(e) => { if (e.key === 'Enter') sendMessage() }}
                  />
                  <button onClick={sendMessage} className={`px-4 py-2 ${buttonBgClass} hover:bg-blue-700 text-white rounded-lg transition-colors`}>
                    Send
                  </button>
                </div>
              </div>
            ) : (
              <div className={`p-4 border-t ${borderClass}`}>
                <div className={`${chatBgClass} rounded-lg p-3 text-center`}>
                  <MessageCircle size={24} className={`${textSecondaryClass} mx-auto mb-2`} />
                  <p className={`${textSecondaryClass} text-sm`}>Chat has been disabled by the host</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Context Menu - Rendered via Portal at document body level */}
      {contextMenu && createPortal(
        <ParticipantContextMenu
          participant={contextMenu.participant}
          position={contextMenu.position}
          onClose={closeContextMenu}
          onMuteAudio={handleMuteParticipant}
          onDisableVideo={handleDisableVideo}
          onStopScreenShare={handleStopScreenShare}
          onMakeCoHost={handleMakeCoHost}
          onRemoveCoHost={handleRemoveCoHost}
          onKick={handleKick}
          isCoHost={contextMenu.participant?.role === 'co-host'}
          settings={settings}
        />,
        document.body
      )}
    </div>
  )
}

export default MeetingSidebar

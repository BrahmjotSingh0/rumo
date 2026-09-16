import { IconMicrophoneOff as MicOff, IconVideoOff as VideoOff, IconDeviceDesktop as Monitor, IconCrown as Crown, IconUserX as UserX, IconShield as Shield } from '@tabler/icons-react'
import { useEffect, useRef } from 'react'

const ParticipantContextMenu = ({ 
  participant, 
  position, 
  onClose, 
  onMuteAudio,
  onDisableVideo,
  onStopScreenShare,
  onMakeCoHost,
  onRemoveCoHost,
  onKick,
  isCoHost = false,
  settings
}) => {
  const menuRef = useRef()

  useEffect(() => {
    const handleClickOutside = (event) => {
      // Don't close if clicking on the 3-dot menu button
      const isMenuButton = event.target.closest('button[title="Participant options"]')
      if (isMenuButton) return
      
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose()
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    // Small delay to prevent immediate close from the opening click
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 50)
    
    document.addEventListener('keydown', handleEscape)
    
    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  if (!participant) return null

  const isLight = settings?.theme === 'light'
  const bgClass = isLight ? 'bg-white' : 'bg-gray-900'
  const borderClass = isLight ? 'border-gray-200' : 'border-gray-700'
  const textClass = isLight ? 'text-gray-900' : 'text-white'
  const textSecondaryClass = isLight ? 'text-gray-600' : 'text-gray-400'
  const hoverClass = isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-800'

  const menuItems = [
    {
      icon: MicOff,
      label: 'Mute Audio',
      onClick: () => { onMuteAudio(participant); onClose() },
      show: true, // Always show
      danger: false
    },
    {
      icon: VideoOff,
      label: 'Disable Video',
      onClick: () => { onDisableVideo(participant); onClose() },
      show: true, // Always show
      danger: false
    },
    {
      icon: Monitor,
      label: 'Stop Screen Share',
      onClick: () => { onStopScreenShare(participant); onClose() },
      show: true, // Always show
      danger: false
    },
    {
      icon: isCoHost ? Shield : Crown,
      label: isCoHost ? 'Remove Co-Host' : 'Make Co-Host',
      onClick: () => { 
        if (isCoHost) {
          onRemoveCoHost(participant)
        } else {
          onMakeCoHost(participant)
        }
        onClose()
      },
      show: true,
      danger: false
    },
    {
      icon: UserX,
      label: 'Remove from Meeting',
      onClick: () => { onKick(participant); onClose() },
      show: true,
      danger: true
    }
  ]

  // Calculate position to keep menu in viewport
  const adjustedPosition = {
    top: Math.min(position.y, window.innerHeight - 250),
    left: Math.min(position.x, window.innerWidth - 220)
  }

  return (
    <div
      ref={menuRef}
      className={`fixed z-[9999] ${bgClass} border ${borderClass} rounded-xl shadow-2xl py-2 w-52`}
      style={{
        top: `${adjustedPosition.top}px`,
        left: `${adjustedPosition.left}px`
      }}
    >
      {/* Participant Info Header */}
      <div className={`px-4 py-2 border-b ${borderClass}`}>
        <p className={`${textClass} font-medium text-sm truncate`}>{participant.name}</p>
        <p className={`${textSecondaryClass} text-xs`}>
          {isCoHost ? 'Co-Host' : 'Participant'}
        </p>
      </div>

      {/* Menu Items */}
      <div className="py-1">
        {menuItems.filter(item => item.show).map((item, index) => {
          const Icon = item.icon
          return (
            <button
              key={index}
              onClick={item.onClick}
              className={`w-full px-4 py-2.5 text-left flex items-center gap-3 transition-colors ${
                item.danger 
                  ? 'text-red-500 hover:bg-red-500/10' 
                  : `${textClass} ${hoverClass}`
              }`}
            >
              <Icon size={16} className="flex-shrink-0" />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default ParticipantContextMenu

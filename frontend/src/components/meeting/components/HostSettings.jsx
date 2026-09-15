import { MicOff, MessageSquare, MessageSquareOff, Lock, Unlock, VideoOff, MonitorOff, Settings, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

const HostSettings = ({ 
  roomSettings = {
    allowChat: true,
    isPrivate: false,
    allMuted: false,
    allCamerasOff: false,
    allScreenShareOff: false
  },
  onMuteAll,
  onToggleChat,
  onToggleRoomType,
  onDisableAllCameras,
  onDisableAllScreenShares,
  settings
}) => {
  const [isExpanded, setIsExpanded] = useState(true)
  
  const isLight = settings?.theme === 'light'
  const bgClass = isLight ? 'bg-gray-50/50' : 'bg-gray-800/50'
  const borderClass = isLight ? 'border-gray-200' : 'border-gray-700/50'
  const textClass = isLight ? 'text-gray-900' : 'text-white'
  const textSecondaryClass = isLight ? 'text-gray-600' : 'text-gray-400'
  const iconBgClass = isLight ? 'bg-blue-100' : 'bg-blue-500/20'
  const iconColorClass = isLight ? 'text-blue-600' : 'text-blue-400'
  const hoverClass = isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-700/50'

  const toggles = [
    {
      icon: MicOff,
      label: 'Mute All Participants',
      description: 'Mute everyone in the meeting',
      enabled: roomSettings.allMuted,
      onClick: onMuteAll,
      color: 'red'
    },
    {
      icon: roomSettings.allowChat ? MessageSquare : MessageSquareOff,
      label: 'Chat',
      description: roomSettings.allowChat ? 'Chat is enabled' : 'Chat is disabled',
      enabled: roomSettings.allowChat,
      onClick: onToggleChat,
      color: 'blue'
    },
    {
      icon: roomSettings.isPrivate ? Lock : Unlock,
      label: 'Room Type',
      description: roomSettings.isPrivate ? 'Private (Waiting room)' : 'Public (Open)',
      enabled: roomSettings.isPrivate,
      onClick: onToggleRoomType,
      color: 'purple'
    },
    {
      icon: VideoOff,
      label: 'Disable All Cameras',
      description: 'Turn off all participant cameras',
      enabled: roomSettings.allCamerasOff,
      onClick: onDisableAllCameras,
      color: 'orange'
    },
    {
      icon: MonitorOff,
      label: 'Disable All Screen Shares',
      description: 'Stop all screen shares',
      enabled: roomSettings.allScreenShareOff,
      onClick: onDisableAllScreenShares,
      color: 'yellow'
    }
  ]

  return (
    <div className={`${bgClass} rounded-xl border ${borderClass} p-4 mb-4`}>
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between ${hoverClass} rounded-lg p-2 -m-2 transition-colors`}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 ${iconBgClass} rounded-lg`}>
            <Settings className={iconColorClass} size={18} />
          </div>
          <div className="text-left">
            <h3 className={`${textClass} font-semibold text-sm`}>Host Controls</h3>
            <p className={`${textSecondaryClass} text-xs`}>
              {isExpanded ? 'Click to collapse' : 'Click to expand settings'}
            </p>
          </div>
        </div>
        {isExpanded ? <ChevronUp size={20} className={textSecondaryClass} /> : <ChevronDown size={20} className={textSecondaryClass} />}
      </button>

      {/* Settings Toggles - Collapsible */}
      {isExpanded && (
        <div className="space-y-3 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          {toggles.map((toggle, index) => {
            const Icon = toggle.icon
            return (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`p-2 rounded-lg ${
                    toggle.color === 'red' ? 'bg-red-500/10' :
                    toggle.color === 'blue' ? 'bg-blue-500/10' :
                    toggle.color === 'purple' ? 'bg-purple-500/10' :
                    toggle.color === 'orange' ? 'bg-orange-500/10' :
                    'bg-yellow-500/10'
                  }`}>
                    <Icon size={16} className={
                      toggle.color === 'red' ? 'text-red-500' :
                      toggle.color === 'blue' ? 'text-blue-500' :
                      toggle.color === 'purple' ? 'text-purple-500' :
                      toggle.color === 'orange' ? 'text-orange-500' :
                      'text-yellow-500'
                    } />
                  </div>
                  <div className="flex-1">
                    <p className={`${textClass} font-medium text-sm`}>{toggle.label}</p>
                    <p className={`${textSecondaryClass} text-xs`}>{toggle.description}</p>
                  </div>
                </div>
                <button
                  onClick={toggle.onClick}
                  className={`relative w-11 h-6 rounded-full transition-all duration-200 flex-shrink-0 ${
                    toggle.enabled 
                      ? toggle.color === 'red' ? 'bg-red-500 shadow-lg shadow-red-500/25' :
                        toggle.color === 'blue' ? 'bg-blue-600 shadow-lg shadow-blue-600/25' :
                        toggle.color === 'purple' ? 'bg-purple-600 shadow-lg shadow-purple-600/25' :
                        toggle.color === 'orange' ? 'bg-orange-500 shadow-lg shadow-orange-500/25' :
                        'bg-yellow-500 shadow-lg shadow-yellow-500/25'
                      : isLight ? 'bg-gray-300' : 'bg-gray-600'
                  }`}
                >
                  <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform duration-200 shadow-lg ${
                    toggle.enabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default HostSettings

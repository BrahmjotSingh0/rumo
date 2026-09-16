import { IconMicrophoneOff as MicOff, IconMicrophone as Mic, IconMessage as MessageSquare, IconMessageOff as MessageSquareOff, IconLock as Lock, IconLockOpen as Unlock, IconVideoOff as VideoOff, IconDeviceDesktopOff as MonitorOff, IconDeviceDesktopCheck as MonitorCheck, IconDoorOff as DoorClosed, IconDoor as DoorOpen, IconSettings as Settings, IconChevronDown as ChevronDown, IconChevronUp as ChevronUp, IconShield as Shield } from '@tabler/icons-react'
import { useState } from 'react'

const HostSettings = ({
  roomSettings = {
    allowChat: true,
    isPrivate: false,
    allMuted: false,
    allCamerasOff: false,
    allScreenShareOff: false,
    isLocked: false,
    allowSelfUnmute: true,
    allowParticipantScreenShare: true,
    coHostsCanManageParticipants: true,
    coHostsCanChangeSettings: false
  },
  isHost = false,
  onMuteAll,
  onToggleChat,
  onToggleRoomType,
  onDisableAllCameras,
  onDisableAllScreenShares,
  onLockMeeting,
  onToggleSelfUnmute,
  onToggleParticipantScreenShare,
  onSetCoHostPermissions,
  features = {},
  settings
}) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const isLight = settings?.theme === 'light'
  const bgClass = isLight ? 'bg-gray-50/50' : 'bg-gray-800/50'
  const borderClass = isLight ? 'border-gray-200' : 'border-gray-700/50'
  const textClass = isLight ? 'text-gray-900' : 'text-white'
  const textSecondaryClass = isLight ? 'text-gray-600' : 'text-gray-400'
  const iconBgClass = isLight ? 'bg-blue-100' : 'bg-blue-500/20'
  const iconColorClass = isLight ? 'text-blue-600' : 'text-blue-400'
  const hoverClass = isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-700/50'

  const allToggles = [
    {
      key: 'muteAll',
      icon: MicOff,
      label: 'Mute All Participants',
      description: 'Mute everyone in the meeting',
      enabled: roomSettings.allMuted,
      onClick: onMuteAll,
      color: 'red'
    },
    {
      key: 'chat',
      icon: roomSettings.allowChat ? MessageSquare : MessageSquareOff,
      label: 'Chat',
      description: roomSettings.allowChat ? 'Chat is enabled' : 'Chat is disabled',
      enabled: roomSettings.allowChat,
      onClick: onToggleChat,
      color: 'blue'
    },
    {
      key: 'waitingRoom',
      icon: roomSettings.isPrivate ? Lock : Unlock,
      label: 'Room Type',
      description: roomSettings.isPrivate ? 'Private (Waiting room)' : 'Public (Open)',
      enabled: roomSettings.isPrivate,
      onClick: onToggleRoomType,
      color: 'purple'
    },
    {
      key: 'lockMeeting',
      icon: roomSettings.isLocked ? DoorClosed : DoorOpen,
      label: 'Lock Meeting',
      description: roomSettings.isLocked ? 'No one new can join' : 'New participants can join',
      enabled: roomSettings.isLocked,
      onClick: onLockMeeting,
      color: 'red'
    },
    {
      key: 'disableAllCameras',
      icon: VideoOff,
      label: 'Disable All Cameras',
      description: 'Turn off all participant cameras',
      enabled: roomSettings.allCamerasOff,
      onClick: onDisableAllCameras,
      color: 'orange'
    },
    {
      key: 'disableAllScreenShares',
      icon: MonitorOff,
      label: 'Disable All Screen Shares',
      description: 'Stop all screen shares',
      enabled: roomSettings.allScreenShareOff,
      onClick: onDisableAllScreenShares,
      color: 'yellow'
    },
    {
      key: null, // always available - not a standalone feature to disable
      icon: roomSettings.allowSelfUnmute ? Mic : MicOff,
      label: 'Allow Self-Unmute',
      description: roomSettings.allowSelfUnmute ? 'Muted participants can unmute themselves' : 'Only host/co-host can unmute participants',
      enabled: roomSettings.allowSelfUnmute,
      onClick: onToggleSelfUnmute,
      color: 'blue'
    },
    {
      key: 'screenShare',
      icon: roomSettings.allowParticipantScreenShare ? MonitorCheck : MonitorOff,
      label: 'Allow Participant Screen Share',
      description: roomSettings.allowParticipantScreenShare ? 'Anyone can share their screen' : 'Only host/co-host can share their screen',
      enabled: roomSettings.allowParticipantScreenShare,
      onClick: onToggleParticipantScreenShare,
      color: 'purple'
    }
  ]

  const toggles = allToggles.filter((toggle) => toggle.key === null || features[toggle.key] !== false)

  const colorClasses = {
    red: { bg: 'bg-red-500/10', text: 'text-red-500', enabled: 'bg-red-500 shadow-lg shadow-red-500/25' },
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-500', enabled: 'bg-blue-600 shadow-lg shadow-blue-600/25' },
    purple: { bg: 'bg-purple-500/10', text: 'text-purple-500', enabled: 'bg-purple-600 shadow-lg shadow-purple-600/25' },
    orange: { bg: 'bg-orange-500/10', text: 'text-orange-500', enabled: 'bg-orange-500 shadow-lg shadow-orange-500/25' },
    yellow: { bg: 'bg-yellow-500/10', text: 'text-yellow-500', enabled: 'bg-yellow-500 shadow-lg shadow-yellow-500/25' }
  }

  const renderToggleRow = (toggle, index) => {
    const Icon = toggle.icon
    const colors = colorClasses[toggle.color]
    return (
      <div key={index} className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <div className={`p-2 rounded-lg ${colors.bg}`}>
            <Icon size={16} className={colors.text} />
          </div>
          <div className="flex-1">
            <p className={`${textClass} font-medium text-sm`}>{toggle.label}</p>
            <p className={`${textSecondaryClass} text-xs`}>{toggle.description}</p>
          </div>
        </div>
        <button
          onClick={toggle.onClick}
          className={`relative w-11 h-6 rounded-full transition-all duration-200 flex-shrink-0 ${
            toggle.enabled ? colors.enabled : isLight ? 'bg-gray-300' : 'bg-gray-600'
          }`}
        >
          <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform duration-200 shadow-lg ${
            toggle.enabled ? 'translate-x-5' : 'translate-x-0.5'
          }`} />
        </button>
      </div>
    )
  }

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
        <>
          <div className="space-y-3 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            {toggles.map(renderToggleRow)}
          </div>

          {isHost && features.coHost !== false && (
            <div className="space-y-3 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Shield size={14} className={textSecondaryClass} />
                <p className={`${textSecondaryClass} text-xs font-semibold uppercase tracking-wide`}>Co-host permissions</p>
              </div>
              {renderToggleRow({
                icon: Shield,
                label: 'Co-hosts Can Manage Participants',
                description: 'Mute, remove, and disable video/screen share for others',
                enabled: roomSettings.coHostsCanManageParticipants,
                onClick: () => onSetCoHostPermissions?.({ canManageParticipants: !roomSettings.coHostsCanManageParticipants }),
                color: 'blue'
              }, 'cohost-manage')}
              {renderToggleRow({
                icon: Shield,
                label: 'Co-hosts Can Change Room Settings',
                description: 'Mute-all, lock, chat, room type, and the toggles above',
                enabled: roomSettings.coHostsCanChangeSettings,
                onClick: () => onSetCoHostPermissions?.({ canChangeSettings: !roomSettings.coHostsCanChangeSettings }),
                color: 'purple'
              }, 'cohost-settings')}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default HostSettings

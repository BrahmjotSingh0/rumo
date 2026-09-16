import { createPortal } from 'react-dom'
import { X, Shield, DoorOpen, Info } from 'lucide-react'
import HostSettings from './HostSettings'

// Host Controls and Breakout Rooms both live here instead of sitting inline
// in the participant list - they're host-only, used far less often than
// chat/participants, and were crowding the panel regular attendees see too.
const HostToolsPanel = ({
  onClose,
  isHost,
  roomSettings,
  onMuteAll,
  onToggleChat,
  onToggleRoomType,
  onDisableAllCameras,
  onDisableAllScreenShares,
  onLockMeeting,
  onToggleSelfUnmute,
  onToggleParticipantScreenShare,
  onSetCoHostPermissions,
  features,
  settings,
  breakoutRooms,
  breakoutCount,
  setBreakoutCount,
  createBreakoutRooms,
  autoAssignBreakouts,
  closeBreakoutRooms
}) => {
  const isLight = settings?.theme === 'light'
  const bgClass = isLight ? 'bg-white' : 'bg-gray-900'
  const borderClass = isLight ? 'border-gray-200' : 'border-gray-700/50'
  const textClass = isLight ? 'text-gray-900' : 'text-white'
  const textSecondaryClass = isLight ? 'text-gray-600' : 'text-gray-400'
  const itemBgClass = isLight ? 'bg-gray-50' : 'bg-gray-800/50'
  const inputBgClass = isLight ? 'bg-gray-100' : 'bg-gray-700'
  const hoverClass = isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-800'

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-lg max-h-[85vh] flex flex-col ${bgClass} rounded-2xl border ${borderClass} shadow-2xl`}>
        <div className={`flex items-center justify-between p-4 border-b ${borderClass}`}>
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-blue-500" />
            <h2 className={`${textClass} font-semibold text-lg`}>Host tools</h2>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl ${hoverClass} ${textSecondaryClass} hover:${textClass} transition-colors`}>
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto themed-scrollbar">
          <HostSettings
            roomSettings={roomSettings}
            isHost={isHost}
            onMuteAll={onMuteAll}
            onToggleChat={onToggleChat}
            onToggleRoomType={onToggleRoomType}
            onDisableAllCameras={onDisableAllCameras}
            onDisableAllScreenShares={onDisableAllScreenShares}
            onLockMeeting={onLockMeeting}
            onToggleSelfUnmute={onToggleSelfUnmute}
            onToggleParticipantScreenShare={onToggleParticipantScreenShare}
            onSetCoHostPermissions={onSetCoHostPermissions}
            features={features}
            settings={settings}
          />

          {isHost && features.breakoutRooms && (
            <div className={`${itemBgClass} rounded-xl border ${borderClass} p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <DoorOpen size={16} className="text-blue-500" />
                <h3 className={`${textClass} font-semibold text-sm`}>Breakout rooms</h3>
              </div>

              <div className={`flex items-start gap-2 ${textSecondaryClass} text-xs rounded-lg ${inputBgClass} p-3 mb-3`}>
                <Info size={14} className="flex-shrink-0 mt-0.5" />
                <p>
                  Each breakout room is a separate Rumo meeting. When you assign someone, their browser
                  navigates them straight into it, with everyone using the same join link. They can come
                  back to this room anytime from the banner shown while they&apos;re there. Closing all
                  breakout rooms doesn&apos;t move anyone back automatically, so let people know before you do.
                </p>
              </div>

              {breakoutRooms.length === 0 ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={2}
                    max={20}
                    value={breakoutCount}
                    onChange={(e) => setBreakoutCount(Math.min(20, Math.max(2, parseInt(e.target.value, 10) || 2)))}
                    className={`w-16 ${inputBgClass} ${textClass} px-2 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                  <button onClick={createBreakoutRooms} className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium">
                    Create {breakoutCount} breakout rooms
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className={`${textSecondaryClass} text-xs`}>
                    {breakoutRooms.length} breakout rooms ready. Assign people to one from their entry in the
                    People tab, or:
                  </p>
                  <div className="flex gap-2">
                    <button onClick={autoAssignBreakouts} className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium">
                      Auto-assign everyone
                    </button>
                    <button onClick={closeBreakoutRooms} className="px-3 py-1.5 text-xs rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium">
                      Close all
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default HostToolsPanel

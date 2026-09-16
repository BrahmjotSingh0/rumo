import { Check, X, Clock, User } from 'lucide-react'
import { useState } from 'react'

const JoinRequestPopup = ({ request, onApprove, onReject, settings }) => {
  const [isProcessing, setIsProcessing] = useState(false)

  const handleApprove = async () => {
    setIsProcessing(true)
    await onApprove(request.socketId)
    setIsProcessing(false)
  }

  const handleReject = async () => {
    setIsProcessing(true)
    await onReject(request.socketId)
    setIsProcessing(false)
  }

  const formatTime = (timestamp) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }

  const isLight = settings?.theme === 'light'
  const bgClass = isLight ? 'bg-white' : 'bg-gray-800'
  const borderClass = isLight ? 'border-gray-200' : 'border-gray-700'
  const textClass = isLight ? 'text-gray-900' : 'text-white'
  const textSecondaryClass = isLight ? 'text-gray-600' : 'text-gray-400'

  return (
    <div className="fixed top-20 left-4 right-4 sm:left-auto sm:w-full sm:max-w-sm z-50 animate-slide-in-right">
      <div className={`${bgClass} ${borderClass} border rounded-xl shadow-2xl overflow-hidden`}>
        {/* Header */}
        <div className={`px-4 py-3 ${isLight ? 'bg-blue-50' : 'bg-blue-900/30'} border-b ${borderClass}`}>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500/20 rounded-lg">
              <Clock size={16} className="text-blue-400" />
            </div>
            <h3 className={`font-semibold ${textClass}`}>Join Request</h3>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            {request.profilePicture ? (
              <img
                src={request.profilePicture}
                alt={request.userName}
                className="w-12 h-12 rounded-full object-cover border-2 border-blue-500/50"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                <User size={24} className="text-white" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className={`font-medium ${textClass} truncate`}>{request.userName}</p>
              <p className={`text-sm ${textSecondaryClass}`}>
                Requested {formatTime(request.timestamp)}
              </p>
            </div>
          </div>

          <p className={`text-sm ${textSecondaryClass} mb-4`}>
            wants to join this meeting
          </p>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleReject}
              disabled={isProcessing}
              className={`
                flex-1 px-4 py-2 rounded-lg font-medium transition-all
                ${isLight 
                  ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' 
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center gap-2
              `}
            >
              <X size={18} />
              Reject
            </button>
            <button
              onClick={handleApprove}
              disabled={isProcessing}
              className={`
                flex-1 px-4 py-2 rounded-lg font-medium transition-all
                bg-gradient-to-r from-blue-500 to-blue-600 
                hover:from-blue-600 hover:to-blue-700
                text-white shadow-lg shadow-blue-500/25
                disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center gap-2
              `}
            >
              <Check size={18} />
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default JoinRequestPopup

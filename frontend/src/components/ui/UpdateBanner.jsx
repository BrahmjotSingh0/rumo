import { IconX as X, IconSparkles as Sparkles } from '@tabler/icons-react'
import { useVersionCheck } from '../../hooks/useVersionCheck'

// Small, dismissible "an update is available" notice for the landing page.
// See useVersionCheck for how this is determined (a daily, anonymous,
// backend-side check against GitHub's public releases API - never a direct
// call from the visitor's own browser).
const UpdateBanner = () => {
  const { updateAvailable, current, latest, releaseUrl, dismiss } = useVersionCheck()

  if (!updateAvailable) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-full sm:max-w-sm z-50 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-4 flex items-start gap-3">
      <div className="p-2 bg-blue-500/15 rounded-lg flex-shrink-0">
        <Sparkles size={16} className="text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white text-sm">Update available: v{latest}</p>
        <p className="text-gray-400 text-xs mt-0.5">This instance is running v{current}.</p>
        {releaseUrl && (
          <a
            href={releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 text-xs mt-2 inline-block"
          >
            See what&apos;s new
          </a>
        )}
      </div>
      <button onClick={dismiss} className="text-gray-500 hover:text-gray-300 flex-shrink-0" title="Dismiss">
        <X size={16} />
      </button>
    </div>
  )
}

export default UpdateBanner

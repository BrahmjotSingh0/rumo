import { IconSparkles as Sparkles } from '@tabler/icons-react'
import { useVersionCheck } from '../../hooks/useVersionCheck'

// Same check as the landing page's UpdateBanner, but inline and not
// dismissible - this is the admin's own settings page, so it stays visible
// until the instance is actually updated rather than being something to
// brush past once.
const VersionNotice = () => {
  const { updateAvailable, current, latest, releaseUrl } = useVersionCheck()

  if (!updateAvailable) return null

  return (
    <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 sm:p-4 mb-6">
      <Sparkles size={18} className="text-blue-400 flex-shrink-0" />
      <p className="text-sm text-gray-200 flex-1 min-w-0">
        <span className="font-medium text-white">Update available: v{latest}</span>
        {' '}(this instance is running v{current}).
        {releaseUrl && (
          <>
            {' '}
            <a href={releaseUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
              See what&apos;s new
            </a>
          </>
        )}
      </p>
    </div>
  )
}

export default VersionNotice

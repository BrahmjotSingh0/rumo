import { useState } from 'react'
import { Settings, X, Monitor, Palette, Layout, Volume2, Video, Eye, RotateCcw } from 'lucide-react'

const SettingsPanel = ({ isOpen, onClose, settings, updateSetting, resetSettings }) => {
  const [activeTab, setActiveTab] = useState('appearance')

  if (!isOpen) return null

  const tabs = [
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'video', label: 'Video', icon: Video },
    { id: 'audio', label: 'Audio', icon: Volume2 },
    { id: 'layout', label: 'Layout', icon: Layout }
  ]

  const isLight = settings.theme === 'light'

  const bgClass = isLight ? 'bg-white/95' : 'bg-gray-900/95'
  const borderClass = isLight ? 'border-gray-200' : 'border-gray-800/50'
  const headerBgClass = isLight ? 'from-gray-50/50 to-white/50' : 'from-gray-800/50 to-gray-900/50'
  const iconBgClass = isLight ? 'bg-blue-100' : 'bg-blue-500/20'
  const iconColorClass = isLight ? 'text-blue-600' : 'text-blue-400'
  const textClass = isLight ? 'text-gray-900' : 'text-white'
  const textSecondaryClass = isLight ? 'text-gray-600' : 'text-gray-400'
  const hoverClass = isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-800/50'
  const sidebarBgClass = isLight ? 'bg-gray-50/50' : 'bg-gray-800/50'
  const activeButtonClass = isLight ? 'bg-blue-600 text-white' : 'bg-blue-600/90 text-white'
  const inactiveButtonClass = isLight ? 'text-gray-700 hover:bg-gray-100 hover:text-gray-900' : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
  const inputBgClass = isLight ? 'bg-gray-50' : 'bg-gray-800/50'
  const inputBorderClass = isLight ? 'border-gray-200' : 'border-gray-600/50'
  const footerBgClass = isLight ? 'bg-gray-50/30' : 'bg-gray-800/30'

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
      <div className={`${bgClass} backdrop-blur-xl rounded-2xl border ${borderClass} w-full max-w-2xl max-h-[90vh] sm:max-h-[80vh] overflow-hidden shadow-2xl flex flex-col`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-4 sm:p-6 border-b ${borderClass} bg-gradient-to-r ${headerBgClass}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 ${iconBgClass} rounded-lg`}>
              <Settings className={iconColorClass} size={20} />
            </div>
            <h2 className={`text-lg sm:text-xl font-semibold ${textClass}`}>Settings</h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 ${hoverClass} rounded-xl ${textSecondaryClass} hover:${textClass} transition-all duration-200`}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">
          {/* Sidebar - Horizontal tabs on mobile, vertical on desktop */}
          <div className={`${sidebarBgClass} p-2 sm:p-4 sm:w-48 border-b sm:border-b-0 sm:border-r ${borderClass} overflow-x-auto sm:overflow-x-visible`}>
            <nav className="flex sm:flex-col sm:space-y-2 gap-2 sm:gap-0">
              {tabs.map(tab => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-3 py-2 sm:py-3 rounded-xl text-left transition-all duration-200 whitespace-nowrap sm:w-full ${
                      activeTab === tab.id
                        ? activeButtonClass + ' shadow-lg'
                        : inactiveButtonClass
                    }`}
                  >
                    <Icon size={18} className="flex-shrink-0" />
                    <span className="text-sm sm:text-base">{tab.label}</span>
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <div>
                  <label className={`block text-sm font-medium ${textClass} mb-3`}>Theme</label>
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    {[
                      { id: 'dark', label: 'Dark', bg: 'bg-gray-950', preview: 'bg-gray-800' },
                      { id: 'light', label: 'Light', bg: 'bg-gray-50', preview: 'bg-white border border-gray-200' }
                    ].map(theme => (
                      <button
                        key={theme.id}
                        onClick={() => updateSetting('theme', theme.id)}
                        className={`p-3 sm:p-4 rounded-xl border-2 transition-all duration-200 ${
                          settings.theme === theme.id
                            ? `border-blue-500 ${isLight ? 'bg-blue-50' : 'bg-blue-500/10'} shadow-lg`
                            : `${inputBorderClass} ${hoverClass} ${isLight ? 'hover:border-gray-300' : 'hover:border-gray-500/50'}`
                        }`}
                      >
                        <div className={`w-full h-6 sm:h-8 rounded-lg mb-2 ${theme.preview}`} />
                        <span className={`text-xs sm:text-sm ${textClass} capitalize font-medium`}>{theme.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <label className={`text-sm font-medium ${textClass}`}>Show Participant Names</label>
                    <p className={`text-xs ${textSecondaryClass} mt-0.5`}>Display names on video tiles</p>
                  </div>
                  <button
                    onClick={() => updateSetting('showParticipantNames', !settings.showParticipantNames)}
                    className={`relative w-12 h-6 rounded-full transition-all duration-200 flex-shrink-0 ${
                      settings.showParticipantNames ? 'bg-blue-600 shadow-lg shadow-blue-600/25' : isLight ? 'bg-gray-300' : 'bg-gray-600'
                    }`}
                  >
                    <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform duration-200 shadow-lg ${
                      settings.showParticipantNames ? 'translate-x-6' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <label className={`text-sm font-medium ${textClass}`}>Compact Mode</label>
                    <p className={`text-xs ${textSecondaryClass} mt-0.5`}>Reduce spacing and padding</p>
                  </div>
                  <button
                    onClick={() => updateSetting('compactMode', !settings.compactMode)}
                    className={`relative w-12 h-6 rounded-full transition-all duration-200 flex-shrink-0 ${
                      settings.compactMode ? 'bg-blue-600 shadow-lg shadow-blue-600/25' : isLight ? 'bg-gray-300' : 'bg-gray-600'
                    }`}
                  >
                    <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform duration-200 shadow-lg ${
                      settings.compactMode ? 'translate-x-6' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'video' && (
              <div className="space-y-6">
                <div>
                  <label className={`block text-sm font-medium ${textClass} mb-3`}>Video Quality</label>
                  <select
                    value={settings.videoQuality}
                    onChange={(e) => updateSetting('videoQuality', e.target.value)}
                    className={`w-full ${inputBgClass} border ${inputBorderClass} rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 ${textClass} text-sm sm:text-base focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200`}
                  >
                    <option value="auto">Auto</option>
                    <option value="high">High (1080p)</option>
                    <option value="medium">Medium (720p)</option>
                    <option value="low">Low (480p)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <label className={`text-sm font-medium ${textClass}`}>Background Blur</label>
                    <p className={`text-xs ${textSecondaryClass} mt-0.5`}>Blur background during video calls</p>
                  </div>
                  <button
                    onClick={() => updateSetting('backgroundBlur', !settings.backgroundBlur)}
                    className={`relative w-12 h-6 rounded-full transition-all duration-200 flex-shrink-0 ${
                      settings.backgroundBlur ? 'bg-blue-600 shadow-lg shadow-blue-600/25' : isLight ? 'bg-gray-300' : 'bg-gray-600'
                    }`}
                  >
                    <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform duration-200 shadow-lg ${
                      settings.backgroundBlur ? 'translate-x-6' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'audio' && (
              <div className="space-y-6">
                <div>
                  <label className={`block text-sm font-medium ${textClass} mb-3`}>Audio Quality</label>
                  <select
                    value={settings.audioQuality}
                    onChange={(e) => updateSetting('audioQuality', e.target.value)}
                    className={`w-full ${inputBgClass} border ${inputBorderClass} rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 ${textClass} text-sm sm:text-base focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200`}
                  >
                    <option value="auto">Auto (Recommended)</option>
                    <option value="high">High (48kHz Stereo)</option>
                    <option value="medium">Medium (24kHz Mono)</option>
                    <option value="low">Low (16kHz Mono)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <label className={`text-sm font-medium ${textClass}`}>Advanced Noise Suppression</label>
                    <p className={`text-xs ${textSecondaryClass} mt-0.5`}>Strong noise gate to block background sounds</p>
                  </div>
                  <button
                    onClick={() => updateSetting('noiseSuppression', !settings.noiseSuppression)}
                    className={`relative w-12 h-6 rounded-full transition-all duration-200 flex-shrink-0 ${
                      settings.noiseSuppression ? 'bg-blue-600 shadow-lg shadow-blue-600/25' : isLight ? 'bg-gray-300' : 'bg-gray-600'
                    }`}
                  >
                    <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform duration-200 shadow-lg ${
                      settings.noiseSuppression ? 'translate-x-6' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'layout' && (
              <div className="space-y-6">
                <div>
                  <label className={`block text-sm font-medium ${textClass} mb-3`}>Default Layout</label>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {['grid', 'speaker', 'interview'].map(layout => (
                      <button
                        key={layout}
                        onClick={() => updateSetting('layout', layout)}
                        className={`p-3 sm:p-4 rounded-xl border-2 transition-all duration-200 ${
                          settings.layout === layout
                            ? `border-blue-500 ${isLight ? 'bg-blue-50' : 'bg-blue-500/10'} shadow-lg`
                            : `${inputBorderClass} ${hoverClass} ${isLight ? 'hover:border-gray-300' : 'hover:border-gray-500/50'}`
                        }`}
                      >
                        <div className={`text-xs sm:text-sm ${textClass} capitalize font-medium`}>{layout} View</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <label className={`text-sm font-medium ${textClass}`}>Auto-hide Controls</label>
                    <p className={`text-xs ${textSecondaryClass} mt-0.5`}>Hide controls when inactive</p>
                  </div>
                  <button
                    onClick={() => updateSetting('autoHideControls', !settings.autoHideControls)}
                    className={`relative w-12 h-6 rounded-full transition-all duration-200 flex-shrink-0 ${
                      settings.autoHideControls ? 'bg-blue-600 shadow-lg shadow-blue-600/25' : isLight ? 'bg-gray-300' : 'bg-gray-600'
                    }`}
                  >
                    <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform duration-200 shadow-lg ${
                      settings.autoHideControls ? 'translate-x-6' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <label className={`text-sm font-medium ${textClass}`}>Background Optimization</label>
                    <p className={`text-xs ${textSecondaryClass} mt-0.5`}>Optimize performance when tab is not active</p>
                  </div>
                  <button
                    onClick={() => updateSetting('backgroundOptimization', !settings.backgroundOptimization)}
                    className={`relative w-12 h-6 rounded-full transition-all duration-200 flex-shrink-0 ${
                      settings.backgroundOptimization ? 'bg-blue-600 shadow-lg shadow-blue-600/25' : isLight ? 'bg-gray-300' : 'bg-gray-600'
                    }`}
                  >
                    <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform duration-200 shadow-lg ${
                      settings.backgroundOptimization ? 'translate-x-6' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={`flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-0 p-4 sm:p-6 border-t ${borderClass} ${footerBgClass}`}>
          <button
            onClick={resetSettings}
            className={`flex items-center justify-center gap-2 px-4 py-2 ${textSecondaryClass} hover:${textClass} transition-colors ${hoverClass} rounded-xl text-sm sm:text-base`}
          >
            <RotateCcw size={16} />
            Reset to Default
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all duration-200 hover:scale-105 shadow-lg text-sm sm:text-base"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel
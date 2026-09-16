import { useRef, useEffect, useState } from 'react'
import { Mic, MicOff, VideoOff, Monitor, Pin, Hand } from 'lucide-react'

const VideoGrid = ({ 
  localStream,
  localStreamVersion = 0, // Add version for forcing re-render
  screenStream, 
  remoteStreams,
  remoteStreamVersions = new Map(), // Track remote stream versions
  remoteScreenStreams,
  participants, 
  userName, 
  userProfilePicture,
  audioEnabled, 
  videoEnabled, 
  screenSharing,
  viewMode = 'grid', // 'grid', 'speaker', 'interview'
  isHost = false,
  userRole = null,
  settings = { showParticipantNames: true, compactMode: false }, // Add default
  isMobile,
  setViewMode,
  setPinnedVideo,
  pinnedVideo
}) => {
  const localVideoRef = useRef()
  const screenVideoRef = useRef()
  const mainVideoRef = useRef()
  const thumbnailContainerRef = useRef()

  const [maxVisibleThumbnails, setMaxVisibleThumbnails] = useState(8)

  // Determine what to show in main speaker view. If the viewer hid their own
  // tile and nothing else is pinned, show the first remote participant
  // instead - falling back to yourself only if you're the only one here.
  const firstRemoteParticipant = participants[0]
  const localVideoInfo = { type: 'local-camera', stream: localStream, name: userName, isYou: true, audioEnabled, videoEnabled, profilePicture: userProfilePicture }
  const mainVideo = pinnedVideo || (
    settings.hideSelfView && firstRemoteParticipant
      ? { type: 'remote-camera', stream: remoteStreams.get(firstRemoteParticipant.socketId), ...firstRemoteParticipant }
      : localVideoInfo
  )

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream
      // Force play on mobile
      localVideoRef.current.play().catch(e => console.log('[VideoGrid] ⚠️ Video play failed:', e))
    }

    if (screenStream && screenVideoRef.current) {
      screenVideoRef.current.srcObject = screenStream
      screenVideoRef.current.play().catch(e => console.log('[VideoGrid] Screen play failed:', e))
    }
  }, [localStream, screenStream, localStreamVersion, viewMode]) // Add viewMode to re-attach stream when switching modes

  // Update main video ref when it changes. Several view modes share this one
  // big "main video" element: speaker and sidebar always use it, spotlight
  // always uses it, and interview/webinar fall back to it on mobile (there's
  // no room for a panel layout on a phone screen) - see the `!isMobile`
  // guards on those two modes below.
  useEffect(() => {
    const usesMainVideo = viewMode === 'speaker' || viewMode === 'sidebar' || viewMode === 'spotlight' ||
      ((viewMode === 'interview' || viewMode === 'webinar') && isMobile)
    if (usesMainVideo && mainVideoRef.current) {
      const streamToUse = mainVideo.stream
      if (streamToUse) {
        mainVideoRef.current.srcObject = streamToUse
        // Mobile browser compatibility
        mainVideoRef.current.setAttribute('webkit-playsinline', '')
        mainVideoRef.current.setAttribute('playsinline', '')
        mainVideoRef.current.play().catch(e => {
          console.log('[VideoGrid] ⚠️ Main video play failed, retrying:', e)
          setTimeout(() => {
            mainVideoRef.current?.play().catch(err => console.log('[VideoGrid] ❌ Main video retry failed:', err))
          }, 100)
        })
      }
    }
  }, [viewMode, isMobile, mainVideo.stream, mainVideo.isYou, mainVideo.socketId, localStreamVersion, videoEnabled])

  const handlePin = (videoInfo) => {
    setPinnedVideo(videoInfo)
    setViewMode('speaker') // Switch to speaker view
  }

  // Calculate max visible thumbnails based on container width
  useEffect(() => {
    let timeoutId
    
    const calculateMaxThumbnails = () => {
      // Debounce to avoid excessive calculations
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        if (!thumbnailContainerRef.current) return
        
        const containerWidth = thumbnailContainerRef.current.offsetWidth
        
        // If container not yet rendered or has no width, use default
        if (!containerWidth || containerWidth < 100) {
          setMaxVisibleThumbnails(6)
          return
        }
        
        // Calculate based on settings
        const thumbnailWidth = isMobile ? 128 : 160 // w-32 (128px) or w-40 (160px)
        const gap = settings.compactMode ? 4 : 12 // space-x-1 (4px) or space-x-3 (12px)
        const padding = settings.compactMode ? 8 : 24 // px-1 (8px) or px-3 (24px)
        
        // Calculate how many thumbnails can fit
        const availableWidth = containerWidth - padding
        const thumbnailWithGap = thumbnailWidth + gap
        const maxCount = Math.floor(availableWidth / thumbnailWithGap)
        
        // Ensure at least 2, max 12
        const finalCount = Math.max(2, Math.min(12, maxCount))
        
        
        setMaxVisibleThumbnails(finalCount)
      }, 100) // 100ms debounce
    }
    
    // Initial calculation with slight delay to ensure DOM is ready
    const initialTimeout = setTimeout(calculateMaxThumbnails, 200)

    const resizeObserver = new ResizeObserver(calculateMaxThumbnails)
    const containerNode = thumbnailContainerRef.current
    if (containerNode) {
      resizeObserver.observe(containerNode)
    }

    // Also listen to window resize for zoom changes
    window.addEventListener('resize', calculateMaxThumbnails)

    return () => {
      clearTimeout(timeoutId)
      clearTimeout(initialTimeout)
      if (containerNode) {
        resizeObserver.unobserve(containerNode)
      }
      window.removeEventListener('resize', calculateMaxThumbnails)
    }
  }, [isMobile, settings.compactMode])

  // Sort participants by priority: with camera > without camera
  const sortedParticipants = [...participants].sort((a, b) => {
    const aStream = remoteStreams.get(a.socketId)
    const bStream = remoteStreams.get(b.socketId)
    const aHasVideo = aStream && a.videoEnabled
    const bHasVideo = bStream && b.videoEnabled
    
    if (aHasVideo && !bHasVideo) return -1
    if (!aHasVideo && bHasVideo) return 1
    return 0
  })

  // Interview Mode - Desktop only. On mobile this falls through to the
  // speaker-view layout below (not the grid), so the main-video effect above
  // has to account for that case too.
  if (viewMode === 'interview' && !isMobile) {
    // Separate hosts/co-hosts from regular participants
    const hosts = []
    const coHosts = []
    const interviewees = []
    
    // Add local user to appropriate category
    if (isHost) {
      hosts.push({
        type: 'local-camera',
        stream: localStream,
        name: userName,
        isYou: true,
        audioEnabled,
        videoEnabled,
        profilePicture: userProfilePicture,
        isHost: true
      })
    } else if (userRole === 'co-host') {
      coHosts.push({
        type: 'local-camera',
        stream: localStream,
        name: userName,
        isYou: true,
        audioEnabled,
        videoEnabled,
        profilePicture: userProfilePicture,
        role: 'co-host'
      })
    } else {
      interviewees.push({
        type: 'local-camera',
        stream: localStream,
        name: userName,
        isYou: true,
        audioEnabled,
        videoEnabled,
        profilePicture: userProfilePicture
      })
    }
    
    // Categorize remote participants
    sortedParticipants.forEach(p => {
      const participant = {
        ...p,
        stream: remoteStreams.get(p.socketId),
        streamVersion: remoteStreamVersions.get(p.socketId) || 0
      }
      
      if (p.isHost) {
        hosts.push(participant)
      } else if (p.role === 'co-host') {
        coHosts.push(participant)
      } else {
        interviewees.push(participant)
      }
    })
    
    const totalHosts = hosts.length

    // Limit co-hosts in panel to 2, move extras to participants
    const maxCoHostsInPanel = 2
    const panelCoHosts = coHosts.slice(0, maxCoHostsInPanel)
    const extraCoHosts = coHosts.slice(maxCoHostsInPanel)
    
    // Add extra co-hosts to interviewees
    const allInterviewees = [...extraCoHosts, ...interviewees]
    
    // Sort interviewees: video/screenshare on first, then audio on, then all off
    const sortedInterviewees = [...allInterviewees].sort((a, b) => {
      // Priority 1: Video or screen share enabled
      const aHasVideo = a.videoEnabled || a.isScreenSharing
      const bHasVideo = b.videoEnabled || b.isScreenSharing
      if (aHasVideo && !bHasVideo) return -1
      if (!aHasVideo && bHasVideo) return 1
      
      // Priority 2: Audio enabled
      if (a.audioEnabled && !b.audioEnabled) return -1
      if (!a.audioEnabled && b.audioEnabled) return 1
      
      // Same priority - maintain order
      return 0
    })
    
    // Limit visible participants to 4, show "+X more" on 4th tile
    const maxVisibleParticipants = 4
    const visibleInterviewees = sortedInterviewees.slice(0, maxVisibleParticipants)
    const hiddenCount = Math.max(0, sortedInterviewees.length - maxVisibleParticipants)
    
    const panelTotal = totalHosts + panelCoHosts.length
    
    return (
      <div className="h-full flex flex-col p-6 pt-20 pb-6 gap-6 bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 relative z-0">
        {/* Interview Panel Header */}
        {panelTotal > 0 && (
          <div className="text-center mb-2 relative z-20">
            <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider">Interview Panel</h3>
          </div>
        )}
        
        {/* Interview Panel - Hosts at Top (like judges/interviewers) */}
        <div className={`${panelTotal === 0 ? 'hidden' : 'h-[32%]'} bg-gradient-to-br from-blue-950/30 via-indigo-950/20 to-blue-950/30 rounded-2xl p-5 border border-blue-500/20 shadow-2xl relative z-10`}>
          <div className="h-full flex gap-4 justify-center items-center">
            {/* Left co-hosts */}
            {panelCoHosts.slice(0, Math.floor(panelCoHosts.length / 2)).map((coHost, index) => (
              <VideoTile
                key={coHost.isYou ? `local-cohost-${index}` : coHost.socketId}
                participant={coHost}
                isInterview={true}
                isHost={false}
                isCoHost={true}
                settings={settings}
                totalTiles={panelTotal}
              />
            ))}
            
            {/* Main Host (center, larger) */}
            {hosts.map((host, index) => (
              <VideoTile
                key={host.isYou ? `local-host-${index}` : host.socketId}
                participant={host}
                isInterview={true}
                isHost={true}
                isCoHost={false}
                settings={settings}
                totalTiles={panelTotal}
                isMainHost={true}
              />
            ))}
            
            {/* Right co-hosts */}
            {panelCoHosts.slice(Math.floor(panelCoHosts.length / 2)).map((coHost, index) => (
              <VideoTile
                key={coHost.isYou ? `local-cohost-right-${index}` : coHost.socketId}
                participant={coHost}
                isInterview={true}
                isHost={false}
                isCoHost={true}
                settings={settings}
                totalTiles={panelTotal}
              />
            ))}
          </div>
        </div>
        
        {/* Candidates/Interviewees Section */}
        <div className="flex-1 mt-10 bg-gradient-to-br from-gray-900/40 via-gray-800/30 to-gray-900/40 rounded-2xl p-5 border border-gray-700/30 shadow-xl relative z-10 mt-2 flex flex-col">
          {/* Participants Header */}
          {visibleInterviewees.length > 0 && (
            <div className="text-center mb-3 flex-shrink-0">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Participants {hiddenCount > 0 && `(${visibleInterviewees.length} of ${sortedInterviewees.length})`}
              </h3>
            </div>
          )}
          
          <div className="flex-1 grid grid-cols-4 gap-4 content-center">
            {visibleInterviewees.map((interviewee, index) => {
              // Show "+X more" overlay on the last visible tile if there are hidden participants
              const isLastTile = index === maxVisibleParticipants - 1
              const showMoreOverlay = isLastTile && hiddenCount > 0
              
              return (
                <div key={interviewee.isYou ? `local-${index}` : interviewee.socketId} className="relative aspect-video">
                  <VideoTile
                    participant={interviewee}
                    isInterview={true}
                    isHost={false}
                    settings={settings}
                    totalTiles={visibleInterviewees.length}
                  />
                  {showMoreOverlay && (
                    <div className="absolute inset-0 bg-gradient-to-br from-black/95 via-gray-900/95 to-black/95 rounded-xl flex items-center justify-center backdrop-blur-md ring-1 ring-gray-600/50">
                      <div className="text-center">
                        <div className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mb-2">
                          +{hiddenCount}
                        </div>
                        <div className="text-sm text-gray-300 font-medium">more participants</div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // Webinar Mode - Desktop only (falls back to speaker view on mobile, same
  // reasoning as interview mode above). Same host/co-host panel treatment as
  // interview mode, but the audience below isn't capped at 4 tiles - meant
  // for a "few presenters, many watchers" call rather than an interview.
  if (viewMode === 'webinar' && !isMobile) {
    const hosts = []
    const coHosts = []
    const audience = []

    if (isHost) {
      hosts.push({
        type: 'local-camera', stream: localStream, name: userName, isYou: true,
        audioEnabled, videoEnabled, profilePicture: userProfilePicture, isHost: true
      })
    } else if (userRole === 'co-host') {
      coHosts.push({
        type: 'local-camera', stream: localStream, name: userName, isYou: true,
        audioEnabled, videoEnabled, profilePicture: userProfilePicture, role: 'co-host'
      })
    } else {
      audience.push({
        type: 'local-camera', stream: localStream, name: userName, isYou: true,
        audioEnabled, videoEnabled, profilePicture: userProfilePicture
      })
    }

    sortedParticipants.forEach(p => {
      const participant = { ...p, stream: remoteStreams.get(p.socketId), streamVersion: remoteStreamVersions.get(p.socketId) || 0 }
      if (p.isHost) hosts.push(participant)
      else if (p.role === 'co-host') coHosts.push(participant)
      else audience.push(participant)
    })

    const maxCoHostsInPanel = 3
    const panelCoHosts = coHosts.slice(0, maxCoHostsInPanel)
    const overflowCoHosts = coHosts.slice(maxCoHostsInPanel)
    const allAudience = [...overflowCoHosts, ...audience]
    const panelTotal = hosts.length + panelCoHosts.length

    return (
      <div className="h-full flex flex-col p-6 pt-20 pb-6 gap-4 bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950">
        {panelTotal > 0 && (
          <div className={`${settings.compactMode ? 'h-[30%]' : 'h-[38%]'} flex-shrink-0 bg-gradient-to-br from-blue-950/30 via-indigo-950/20 to-blue-950/30 rounded-2xl p-5 border border-blue-500/20 shadow-2xl`}>
            <div className="h-full flex gap-4 justify-center items-center">
              {panelCoHosts.slice(0, Math.floor(panelCoHosts.length / 2)).map((coHost, index) => (
                <VideoTile key={coHost.isYou ? `webinar-cohost-${index}` : coHost.socketId} participant={coHost} isHost={false} isCoHost={true} settings={settings} />
              ))}
              {hosts.map((host, index) => (
                <VideoTile key={host.isYou ? `webinar-host-${index}` : host.socketId} participant={host} isHost={true} isCoHost={false} settings={settings} isMainHost={true} />
              ))}
              {panelCoHosts.slice(Math.floor(panelCoHosts.length / 2)).map((coHost, index) => (
                <VideoTile key={coHost.isYou ? `webinar-cohost-right-${index}` : coHost.socketId} participant={coHost} isHost={false} isCoHost={true} settings={settings} />
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 bg-gradient-to-br from-gray-900/40 via-gray-800/30 to-gray-900/40 rounded-2xl p-4 border border-gray-700/30 shadow-xl overflow-y-auto">
          {allAudience.length > 0 ? (
            <>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider text-center mb-3">
                Audience ({allAudience.length})
              </h3>
              <div className="grid grid-cols-5 xl:grid-cols-6 gap-3">
                {allAudience.map((person, index) => (
                  <div key={person.isYou ? `webinar-audience-${index}` : person.socketId} className="aspect-video">
                    <VideoTile participant={person} isHost={false} settings={settings} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500 text-sm">No one else here yet</div>
          )}
        </div>
      </div>
    )
  }

  if (viewMode === 'grid') {
    // Collect all video sources
    const allVideos = []
    
    // Add local screen share first (priority)
    if (screenSharing) {
      allVideos.push({ type: 'local-screen', stream: screenStream, name: userName, isYou: true })
    }
    
    // Add remote screen shares
    participants.forEach(participant => {
      const screenStreams = Array.from(remoteScreenStreams.entries())
        .filter(([key]) => key.startsWith(participant.socketId + '-screen'))
      screenStreams.forEach(([, stream]) => {
        allVideos.push({ type: 'remote-screen', stream, name: participant.name, participant })
      })
    })
    
    // Add local camera (unless the viewer chose to hide their own tile)
    if (!settings.hideSelfView) {
      allVideos.push({ type: 'local-camera', stream: localStream, name: userName, isYou: true, audioEnabled, videoEnabled, profilePicture: userProfilePicture })
    }
    
    // Add remote cameras
    participants.forEach(participant => {
      const stream = remoteStreams.get(participant.socketId)
      allVideos.push({ type: 'remote-camera', stream, ...participant })
    })
    
    const totalVideos = allVideos.length
    
    // Google Meet style responsive grid
    const getGridLayout = () => {
      if (isMobile) {
        return totalVideos === 1 ? 'grid-cols-1'
          : totalVideos <= 4 ? 'grid-cols-2'
          : 'grid-cols-2'
      }
      
      if (totalVideos === 1) return 'grid-cols-1'
      if (totalVideos === 2) return 'grid-cols-2'
      if (totalVideos <= 4) return 'grid-cols-2'
      if (totalVideos <= 6) return 'grid-cols-3'
      if (totalVideos <= 9) return 'grid-cols-3'
      if (totalVideos <= 16) return 'grid-cols-4'
      return 'grid-cols-4'
    }

    return (
      <div className={`h-full flex items-center justify-center ${isMobile ? 'pt-20 pb-16 px-4' : 'pt-24 pb-20 px-8'} overflow-hidden`}>
        <div className={`${isMobile ? 'w-full' : 'w-[70%]'} ${isMobile ? '' : 'max-w-5xl'} grid ${getGridLayout()} ${isMobile ? 'gap-2' : 'gap-4'} auto-rows-fr`}>
          {allVideos.map((video, index) => {
            const isScreen = video.type.includes('screen')
            
            return (
              <div key={`${video.type}-${index}`} className={isMobile ? 'flex flex-col' : 'relative'}>
                <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
                  {/* Video or Screen Share */}
                  {video.stream ? (
                    <>
                      <video
                        autoPlay
                        muted={video.isYou}
                        playsInline
                        className={`w-full h-full ${isScreen ? 'object-contain' : 'object-cover'} ${!isScreen && video.isYou && settings.mirrorLocalVideo ? 'scale-x-[-1]' : ''}`}
                        style={{ display: (isScreen || video.videoEnabled) ? 'block' : 'none' }}
                        ref={el => {
                          if (el && video.stream) {
                            el.srcObject = video.stream
                            el.play().catch(e => console.log('Video play failed:', e))
                          }
                        }}
                      />
                      {!isScreen && !video.videoEnabled && (
                        <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                          <div className="text-center">
                            {video.profilePicture ? (
                              <img src={video.profilePicture} alt={video.name} className="w-16 h-16 rounded-full mx-auto mb-2" />
                            ) : (
                              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-2">
                                <span className="text-xl font-semibold text-white">{video.name?.charAt(0)?.toUpperCase()}</span>
                              </div>
                            )}
                            <p className="text-gray-400 text-sm">Camera off</p>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                      <div className="text-center">
                        {video.profilePicture ? (
                          <img src={video.profilePicture} alt={video.name} className="w-16 h-16 rounded-full mx-auto mb-2" />
                        ) : (
                          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-2">
                            <span className="text-xl font-semibold text-white">{video.name?.charAt(0)?.toUpperCase()}</span>
                          </div>
                        )}
                        <p className="text-gray-400 text-sm">Connecting...</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Overlay - Desktop only */}
                  {!isMobile && (
                    <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded text-white text-sm flex items-center gap-1">
                      {isScreen && <Monitor size={14} className="text-blue-400" />}
                      {video.name} {video.isYou && '(You)'} {isScreen && '- Screen'}
                      {video.isHost && <span className="text-blue-400 text-xs">(Host)</span>}
                      {!isScreen && video.handRaised && <Hand size={14} className="text-yellow-400" />}
                      {!isScreen && !video.audioEnabled && <MicOff size={14} className="text-red-400" />}
                      {!isScreen && !video.videoEnabled && <VideoOff size={14} className="text-red-400" />}
                    </div>
                  )}
                </div>
                
                {/* Mobile overlay below tile */}
                {isMobile && (
                  <div className="mt-1 bg-black/70 px-2 py-1 rounded text-white text-xs flex items-center gap-1">
                    {isScreen && <Monitor size={12} className="text-blue-400" />}
                    {video.name} {video.isYou && '(You)'} {isScreen && '- Screen'}
                    {video.isHost && <span className="text-blue-400 text-xs">(Host)</span>}
                    {!isScreen && !video.audioEnabled && <MicOff size={12} className="text-red-400" />}
                    {!isScreen && !video.videoEnabled && <VideoOff size={12} className="text-red-400" />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Spotlight Mode - one video fills the whole stage, no thumbnail strip at
  // all (unlike speaker view, which always keeps one). Works at any size,
  // including mobile - it's the simplest possible layout.
  if (viewMode === 'spotlight') {
    return (
      <div className={`h-full relative bg-black ${isMobile ? '' : 'pt-16'}`}>
        <div className="absolute inset-0 flex items-center justify-center">
          {mainVideo.type?.includes('screen') ? (
            <video ref={mainVideoRef} autoPlay muted={mainVideo.isYou} playsInline className="w-full h-full object-contain bg-black" />
          ) : mainVideo.videoEnabled ? (
            <video
              key={mainVideo.isYou ? `spotlight-video-${localStreamVersion}` : `spotlight-video-${mainVideo.socketId}`}
              ref={mainVideoRef}
              autoPlay
              muted={mainVideo.isYou}
              playsInline
              className={`w-full h-full object-contain bg-black ${mainVideo.isYou && settings.mirrorLocalVideo ? 'scale-x-[-1]' : ''}`}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-950 flex items-center justify-center">
              <div className="text-center">
                {mainVideo.profilePicture ? (
                  <div className="w-28 h-28 rounded-full overflow-hidden mx-auto mb-4 border-4 border-blue-500 shadow-xl">
                    <img src={mainVideo.profilePicture} alt={mainVideo.name} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-28 h-28 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-4xl font-bold text-white">{mainVideo.name?.charAt(0)?.toUpperCase()}</span>
                  </div>
                )}
                <p className="text-gray-300 text-lg">Camera is off</p>
              </div>
            </div>
          )}
        </div>

        {settings.showParticipantNames && (
          <div className="absolute bottom-4 left-4 bg-black/70 px-3 py-2 rounded-lg backdrop-blur-sm flex items-center gap-2 z-10">
            {mainVideo.type?.includes('screen') && <Monitor size={16} className="text-blue-400" />}
            <span className="text-white font-medium">{mainVideo.name} {mainVideo.isYou && '(You)'} {mainVideo.type?.includes('screen') && '- Screen'}</span>
            {mainVideo.isHost && <span className="text-blue-400 text-sm">(Host)</span>}
          </div>
        )}

        {pinnedVideo && (
          <button
            className="absolute top-4 right-4 bg-blue-600/90 hover:bg-blue-700 text-white px-3 py-2 rounded-lg backdrop-blur-sm transition-all duration-200 flex items-center gap-2 z-10"
            onClick={() => setPinnedVideo(null)}
            title="Unpin"
          >
            <Pin size={16} className="fill-current" />
            <span className="text-sm font-medium">Pinned</span>
          </button>
        )}

        {/* Small self-view, unless you're the spotlighted video yourself or hid your own tile */}
        {!mainVideo.isYou && !settings.hideSelfView && (
          <div className={`absolute ${isMobile ? 'bottom-4 right-4 w-24 h-16' : 'bottom-6 right-6 w-40 h-28'} bg-gray-800 rounded-lg overflow-hidden shadow-2xl ring-2 ring-white/20 z-10`}>
            {videoEnabled ? (
              <video
                key={`spotlight-self-${localStreamVersion}`}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover ${settings.mirrorLocalVideo ? 'scale-x-[-1]' : ''}`}
                ref={el => { if (el && localStream) { el.srcObject = localStream; el.play().catch(e => console.log('[VideoGrid] Spotlight self-view play failed:', e)) } }}
              />
            ) : (
              <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                <span className="text-white text-xs font-medium">{userName?.charAt(0)?.toUpperCase()}</span>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Speaker / Sidebar View - also the fallback for interview/webinar on
  // mobile, and for sidebar on mobile (not enough width for a side column
  // there). isSidebarLayout only changes how this is arranged on screen, the
  // main-video and thumbnail-collection logic below is shared by both.
  const isSidebarLayout = viewMode === 'sidebar' && !isMobile
  return (
    <div className={`h-full flex ${isSidebarLayout ? 'flex-row gap-3' : 'flex-col'} ${isMobile ? 'p-2' : settings.compactMode ? 'p-2 pt-14' : 'p-3 pt-16'}`}>
      {/* Main Speaker Video */}
      <div className={`flex-1 bg-gray-800 rounded-lg overflow-hidden ${isSidebarLayout ? '' : settings.compactMode ? 'mb-1' : 'mb-2'} relative min-h-0`}>
        {mainVideo.type?.includes('screen') ? (
          <video ref={mainVideoRef} autoPlay muted={mainVideo.isYou} playsInline className="w-full h-full object-contain bg-black" />
        ) : (
          <>
            <video
              key={mainVideo.isYou ? `main-video-${localStreamVersion}` : `main-video-${mainVideo.socketId}`}
              ref={mainVideoRef}
              autoPlay
              muted={mainVideo.isYou}
              playsInline
              className={`w-full h-full object-contain bg-black ${mainVideo.isYou && settings.mirrorLocalVideo ? 'scale-x-[-1]' : ''}`}
              style={{ display: mainVideo.videoEnabled ? 'block' : 'none' }}
            />
            {!mainVideo.videoEnabled && (
              <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                <div className="text-center">
                  {mainVideo.profilePicture ? (
                    <div className="w-20 h-20 rounded-full overflow-hidden mx-auto mb-3 border-4 border-purple-500 shadow-xl">
                      <img src={mainVideo.profilePicture} alt={mainVideo.name} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-3">
                      <span className="text-3xl font-bold text-white">{mainVideo.name?.charAt(0)?.toUpperCase()}</span>
                    </div>
                  )}
                  <p className="text-gray-300">Camera is off</p>
                </div>
              </div>
            )}
          </>
        )}
        {settings.showParticipantNames && (
          <div className="absolute bottom-4 left-4 bg-black/70 px-3 py-2 rounded-lg backdrop-blur-sm flex items-center gap-2">
            {mainVideo.type?.includes('screen') && <Monitor size={16} className="text-blue-400" />}
            <span className="text-white font-medium">{mainVideo.name} {mainVideo.isYou && '(You)'} {mainVideo.type?.includes('screen') && '- Screen'}</span>
            {mainVideo.isHost && <span className="text-blue-400 text-sm">(Host)</span>}
          </div>
        )}
        {pinnedVideo && (
          <button
            className="absolute top-4 right-4 bg-blue-600/90 hover:bg-blue-700 text-white px-3 py-2 rounded-lg backdrop-blur-sm transition-all duration-200 flex items-center gap-2"
            onClick={() => setPinnedVideo(null)}
            title="Unpin"
          >
            <Pin size={16} className="fill-current" />
            <span className="text-sm font-medium">Pinned</span>
          </button>
        )}
      </div>
      
      {/* Thumbnails - Priority: Screen Shares > Cameras > No Video - Max 4, 4th shows +X more */}
      {(() => {
        const allThumbnails = []
        
        // Collect Local Screen Share
        if (screenSharing && pinnedVideo?.type !== 'local-screen') {
          allThumbnails.push({ id: 'local-screen', type: 'screen', element: 'local-screen' })
        }
        
        // Collect Remote Screen Shares
        sortedParticipants.forEach(participant => {
          const screenStreams = Array.from(remoteScreenStreams.entries())
            .filter(([key]) => key.startsWith(participant.socketId + '-screen'))
          screenStreams.forEach(([key]) => {
            if (!(pinnedVideo?.type === 'remote-screen' && pinnedVideo?.socketId === participant.socketId)) {
              allThumbnails.push({ id: key, type: 'screen', element: key, participant })
            }
          })
        })
        
        // Collect Local Camera (unless the viewer chose to hide their own tile)
        if (pinnedVideo?.type !== 'local-camera' && !settings.hideSelfView) {
          allThumbnails.push({ id: 'local-camera', type: 'camera', element: 'local-camera' })
        }
        
        // Collect Remote Participants
        sortedParticipants.forEach(participant => {
          if (!(pinnedVideo?.type === 'remote-camera' && pinnedVideo?.socketId === participant.socketId)) {
            allThumbnails.push({ id: participant.socketId, type: 'camera', element: participant.socketId, participant })
          }
        })
        
        // The width-based auto-fit calc below only makes sense for a
        // horizontal strip; a vertical sidebar just gets a fixed cap.
        const maxVisible = isSidebarLayout ? 6 : isMobile ? 3 : maxVisibleThumbnails
        const visibleThumbnails = allThumbnails.slice(0, maxVisible)
        const hiddenCount = Math.max(0, allThumbnails.length - maxVisible)

        return (
          <div
            ref={thumbnailContainerRef}
            className={isSidebarLayout
              ? `flex flex-col ${settings.compactMode ? 'space-y-1 py-1' : 'space-y-3 py-3'} overflow-y-auto pr-1 scrollbar-hide w-40 flex-shrink-0`
              : `flex ${settings.compactMode ? 'space-x-1 px-1 pt-2' : 'space-x-3 px-3 pt-3'} overflow-x-auto pb-1 scrollbar-hide`}
          >
            {visibleThumbnails.map((thumb, index) => {
              const isLast = index === maxVisible - 1
              const showMore = isLast && hiddenCount > 0
              
              return (
                <div key={thumb.id} className="relative flex-shrink-0">
                  {/* Render thumbnail based on type */}
                  {thumb.element === 'local-screen' && (
                    <div 
                      className={`flex-shrink-0 ${isMobile ? 'w-32 h-24' : 'w-40 h-28'} bg-gray-800 rounded-lg overflow-hidden relative cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all`}
                      onClick={() => handlePin({ type: 'local-screen', stream: screenStream, name: userName, isYou: true })}
                    >
                      <video ref={screenVideoRef} autoPlay muted playsInline className="w-full h-full object-contain bg-black" />
                      {settings.showParticipantNames && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1 flex items-center gap-1">
                          <Monitor size={12} className="text-blue-400" />
                          <span className="text-white text-xs truncate">{userName} - Screen</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {thumb.type === 'screen' && thumb.element !== 'local-screen' && (() => {
                    const participant = thumb.participant
                    const screenStreams = Array.from(remoteScreenStreams.entries())
                      .filter(([key]) => key === thumb.element)
                    if (screenStreams.length === 0) return null
                    const [, screenStream] = screenStreams[0]
                    
                    return (
                      <div 
                        className={`flex-shrink-0 ${isMobile ? 'w-32 h-24' : 'w-40 h-28'} bg-gray-800 rounded-lg overflow-hidden relative cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all`}
                        onClick={() => handlePin({ type: 'remote-screen', stream: screenStream, name: participant.name, socketId: participant.socketId, isHost: participant.isHost })}
                      >
                        <video autoPlay playsInline className="w-full h-full object-contain bg-black" ref={el => { if (el && screenStream) el.srcObject = screenStream }} />
                        {settings.showParticipantNames && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1 flex items-center gap-1">
                            <Monitor size={12} className="text-blue-400" />
                            <span className="text-white text-xs truncate">{participant.name} - Screen</span>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                  
                  {thumb.element === 'local-camera' && (
                    <div 
                      className={`flex-shrink-0 ${isMobile ? 'w-32 h-24' : 'w-40 h-28'} bg-gray-800 rounded-lg overflow-hidden relative cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all`}
                      onClick={() => handlePin({ type: 'local-camera', stream: localStream, name: userName, isYou: true, audioEnabled, videoEnabled, profilePicture: userProfilePicture })}
                    >
                      {videoEnabled ? (
                        <video
                          key={`local-thumb-${localStreamVersion}`}
                          autoPlay
                          muted
                          playsInline
                          className={`w-full h-full object-cover bg-black ${settings.mirrorLocalVideo ? 'scale-x-[-1]' : ''}`}
                          ref={el => {
                            if (el && localStream) {
                              el.srcObject = localStream
                              el.setAttribute('webkit-playsinline', '')
                              el.setAttribute('playsinline', '')
                              el.play().catch(e => console.log('[VideoGrid] Local thumbnail play failed:', e))
                            }
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                          {userProfilePicture ? (
                            <div className={`${isMobile ? 'w-10 h-10' : 'w-12 h-12'} rounded-full overflow-hidden border-2 border-blue-500`}>
                              <img src={userProfilePicture} alt={userName} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className={`${isMobile ? 'w-10 h-10' : 'w-12 h-12'} bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center`}>
                              <span className={`text-white ${isMobile ? 'text-sm' : 'text-base'} font-medium`}>{userName?.charAt(0)?.toUpperCase()}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {settings.showParticipantNames && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1">
                          <span className="text-white text-xs truncate">{userName} (You)</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {thumb.type === 'camera' && thumb.element !== 'local-camera' && (() => {
                    const participant = thumb.participant
                    const stream = remoteStreams.get(participant.socketId)
                    const remoteVersion = remoteStreamVersions.get(participant.socketId) || 0
                    
                    return (
                      <div 
                        className={`flex-shrink-0 ${isMobile ? 'w-32 h-24' : 'w-40 h-28'} bg-gray-800 rounded-lg overflow-hidden relative cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all`}
                        onClick={() => handlePin({ type: 'remote-camera', stream, name: participant.name, socketId: participant.socketId, isHost: participant.isHost, audioEnabled: participant.audioEnabled, videoEnabled: participant.videoEnabled, profilePicture: participant.profilePicture })}
                      >
                        {stream && participant.videoEnabled ? (
                          <video 
                            key={`remote-thumb-${participant.socketId}-${remoteVersion}`}
                            autoPlay 
                            playsInline 
                            className="w-full h-full object-cover bg-black" 
                            ref={el => { 
                              if (el && stream) {
                                el.srcObject = stream
                                el.setAttribute('webkit-playsinline', '')
                                el.setAttribute('playsinline', '')
                                el.play().catch(e => console.log('[VideoGrid] Remote thumbnail play failed:', e))
                              }
                            }} 
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                            {participant.profilePicture ? (
                              <div className={`${isMobile ? 'w-10 h-10' : 'w-12 h-12'} rounded-full overflow-hidden border-2 border-purple-500`}>
                                <img src={participant.profilePicture} alt={participant.name} className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className={`${isMobile ? 'w-10 h-10' : 'w-12 h-12'} bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center`}>
                                <span className={`text-white ${isMobile ? 'text-sm' : 'text-base'} font-medium`}>{participant.name?.charAt(0)?.toUpperCase()}</span>
                              </div>
                            )}
                          </div>
                        )}
                        {settings.showParticipantNames && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1">
                            <div className="flex items-center justify-between">
                              <span className="text-white text-xs truncate flex-1">{participant.name}</span>
                              <div className="flex items-center gap-1 ml-1">
                                {!participant.audioEnabled && (
                                  <div className="bg-red-500/90 p-1 rounded-full"><MicOff size={10} className="text-white" /></div>
                                )}
                                {!participant.videoEnabled && (
                                  <div className="bg-red-500/90 p-1 rounded-full"><VideoOff size={10} className="text-white" /></div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                  
                  {/* +X more overlay on last thumbnail */}
                  {showMore && (
                    <div className={`absolute inset-0 bg-gradient-to-br from-black/95 via-gray-900/95 to-black/95 rounded-lg flex items-center justify-center backdrop-blur-md`}>
                      <div className="text-center">
                        <div className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mb-1">
                          +{hiddenCount}
                        </div>
                        <div className="text-xs text-gray-300 font-medium">more</div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}
      
    </div>
  )
}

// Interview Mode Video Tile Component
const VideoTile = ({ participant, isHost: isTileHost, isCoHost, isMainHost, settings }) => {
  const videoRef = useRef()

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream
      videoRef.current.play().catch(e => console.log('[VideoTile] Play failed:', e))
    }
  }, [participant.stream, participant.streamVersion])

  // Calculate size based on role and total count
  const getSizeClass = () => {
    if (isMainHost) {
      // Main host - larger and centered
      return 'w-[40%]'
    } else if (isTileHost || isCoHost) {
      // Co-hosts - medium size
      return 'w-[28%]'
    } else {
      // Candidates - standard size
      return 'w-full'
    }
  }
  
  const getRingClass = () => {
    if (isMainHost) return 'ring-4 ring-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.5)]'
    if (isTileHost || isCoHost) return 'ring-2 ring-blue-400/60 shadow-[0_0_20px_rgba(96,165,250,0.3)]'
    return 'ring-1 ring-gray-600/50'
  }
  
  const getBackgroundClass = () => {
    if (isMainHost) return 'bg-gradient-to-br from-blue-900 via-indigo-900 to-blue-950'
    if (isTileHost || isCoHost) return 'bg-gradient-to-br from-blue-800 via-indigo-800 to-blue-900'
    return 'bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900'
  }

  return (
    <div className={`${getSizeClass()} aspect-video relative rounded-xl overflow-hidden shadow-2xl ${getRingClass()} transition-all duration-300 hover:scale-[1.02]`}>
      {participant.videoEnabled ? (
        <video
          key={participant.isYou ? `tile-${participant.streamVersion}` : `tile-${participant.socketId}`}
          ref={videoRef}
          autoPlay
          muted={participant.isYou}
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <div className={`w-full h-full ${getBackgroundClass()} flex items-center justify-center`}>
          <div className="text-center">
            {participant.profilePicture ? (
              <div className={`${isMainHost ? 'w-28 h-28' : (isTileHost || isCoHost) ? 'w-20 h-20' : 'w-16 h-16'} rounded-full overflow-hidden mx-auto mb-3 ${
                isMainHost ? 'border-4 border-blue-400' : (isTileHost || isCoHost) ? 'border-3 border-blue-300' : 'border-2 border-gray-600'
              } shadow-xl`}>
                <img src={participant.profilePicture} alt={participant.name} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className={`${isMainHost ? 'w-28 h-28 text-5xl' : (isTileHost || isCoHost) ? 'w-20 h-20 text-3xl' : 'w-16 h-16 text-2xl'} ${
                isTileHost || isCoHost || isMainHost
                  ? 'bg-gradient-to-br from-blue-500 to-indigo-600' 
                  : 'bg-gradient-to-br from-blue-500 to-purple-600'
              } rounded-full flex items-center justify-center mx-auto mb-3 shadow-xl`}>
                <span className="font-bold text-white">{participant.name?.charAt(0)?.toUpperCase()}</span>
              </div>
            )}
            {!participant.videoEnabled && (
              <p className={`${(isTileHost || isCoHost || isMainHost) ? 'text-blue-200' : 'text-gray-400'} text-sm`}>Camera off</p>
            )}
          </div>
        </div>
      )}
      
      {/* Name and Status Overlay */}
      {settings.showParticipantNames && (
        <div className={`absolute bottom-0 left-0 right-0 ${
          isTileHost || isCoHost || isMainHost
            ? 'bg-gradient-to-t from-blue-900/95 via-blue-900/80 to-transparent' 
            : 'bg-gradient-to-t from-black/95 via-black/80 to-transparent'
        } px-3 py-3`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {(isTileHost || isCoHost || isMainHost) && (
                <div className={`flex-shrink-0 px-2.5 py-1 ${
                  isMainHost ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-sm shadow-lg' : 
                  'bg-gradient-to-r from-blue-400 to-blue-500 text-xs shadow-md'
                } rounded text-white font-bold uppercase tracking-wide`}>
                  {isMainHost ? 'HOST' : isCoHost ? 'CO-HOST' : 'HOST'}
                </div>
              )}
              <span className={`${
                (isTileHost || isCoHost || isMainHost) ? 'text-white font-semibold' : 'text-gray-200'
              } ${isMainHost ? 'text-base' : 'text-sm'} truncate`}>
                {participant.name} {participant.isYou && '(You)'}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {!participant.audioEnabled && (
                <div className="bg-red-500/90 p-1 rounded-full">
                  <MicOff size={12} className="text-white" />
                </div>
              )}
              {!participant.videoEnabled && (
                <div className="bg-red-500/90 p-1 rounded-full">
                  <VideoOff size={12} className="text-white" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VideoGrid

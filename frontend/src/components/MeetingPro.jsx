import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { Grid3X3, User, X, Users, BriefcaseBusiness, Maximize2, PanelRight, Presentation } from 'lucide-react'
import toast from 'react-hot-toast'
import io from 'socket.io-client'
import { SOCKET_URL, ICE_SERVERS } from '../utils/constants'
import { useSettings } from '../hooks/useSettings'
import { useMediaConstraints } from '../hooks/useMediaConstraints'
import { useLiveCaptions } from '../hooks/useLiveCaptions'
import { BackgroundBlurProcessor, SimpleBackgroundBlurProcessor } from '../utils/backgroundBlurSegmentation'
import { createNoiseSuppressor } from '../utils/noiseSuppression'
import branding from '../config/branding'
import api from '../utils/api'
import SettingsPanel from './meeting/components/SettingsPanel'
import Whiteboard from './meeting/components/Whiteboard'
import ReactionOverlay from './meeting/components/ReactionOverlay'
import VideoGrid from './meeting/VideoGrid'
import MeetingSidebar from './meeting/MeetingSidebar'
import MeetingControls from './meeting/MeetingControls'
import JoinRequestPopup from './meeting/JoinRequestPopup'
import { playUserJoined, playYouJoined, playUserLeft, playScreenShareStart, playScreenShareStop, playJoinRequest, playHandRaised, playReaction, playRecordingStart, playRecordingStop, playRemoved, playChatMessage } from '../utils/sounds'

// How long to wait for socket.io's own automatic reconnection to succeed
// (and for this client to rejoin the room) before treating a dropped
// connection as terminal - covers a brief network blip or the backend
// redeploying/restarting for a few seconds.
const RECONNECT_GRACE_MS = 20000

// All layouts VideoGrid knows how to render (see its viewMode prop). Order
// here is the order shown in the layout picker menu.
const LAYOUT_OPTIONS = [
  { id: 'grid', label: 'Grid', icon: Grid3X3 },
  { id: 'speaker', label: 'Speaker', icon: User },
  { id: 'sidebar', label: 'Sidebar', icon: PanelRight },
  { id: 'spotlight', label: 'Spotlight', icon: Maximize2 },
  { id: 'interview', label: 'Interview panel', icon: BriefcaseBusiness },
  { id: 'webinar', label: 'Webinar', icon: Presentation }
]

const MeetingPro = () => {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  // Only allow access if user came through PreJoin (navigation state)
  // On refresh, user stays in meeting (state is lost but that's OK)
  const fromPreJoin = location.state?.fromPreJoin
  
  useEffect(() => {
    // If no navigation state and this is the first render, redirect to PreJoin
    if (!fromPreJoin && !location.state) {
      console.log('Direct access detected - redirecting to PreJoin')
      navigate(`/room/${roomId}`, { replace: true })
    }
  }, [fromPreJoin, location.state, roomId, navigate])
  
  // Get media + name preferences from sessionStorage (set in PreJoin)
  const mediaPreferences = JSON.parse(sessionStorage.getItem('meetingPreferences') || '{"audio":true,"video":true}')

  // Guest identity - no accounts. Name comes from PreJoin; the id is a
  // per-tab id (survives refresh via sessionStorage) so the server can spot
  // the same guest reconnecting from another tab/device.
  const userName = mediaPreferences.name || 'Guest'
  const userId = (() => {
    let id = sessionStorage.getItem('rumo_guest_id')
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem('rumo_guest_id', id)
    }
    return id
  })()

  // Embed mode: this page loaded inside an iframe via embed.js/RumoMeetExternalAPI
  // (see docs/EMBEDDING.md). Enables the postMessage bridge below and skips
  // navigating the iframe to the marketing site on hangup.
  const [searchParams] = useSearchParams()
  const isEmbedded = searchParams.get('embed') === '1' && branding.features.embedding !== false
  const postToParent = (type, payload = {}) => {
    if (!isEmbedded) return
    // Any site can embed a Rumo meeting (docs/EMBEDDING.md), so there's no
    // fixed origin to configure in advance - document.referrer (the
    // embedding page's URL, set by the browser for a same-tab child iframe)
    // is how we find it. If it's unavailable (a strict Referrer-Policy on
    // the embedding page, or a browser that never sets it), fail closed
    // instead of broadcasting to '*': better to silently skip an event than
    // send it to a page we can't identify.
    let targetOrigin
    try {
      targetOrigin = document.referrer ? new URL(document.referrer).origin : null
    } catch {
      targetOrigin = null
    }
    if (!targetOrigin) return
    try {
      window.parent.postMessage({ source: 'rumo', type, payload }, targetOrigin)
    } catch {
      // ignore - no parent frame
    }
  }

  // Core states
  const [socket, setSocket] = useState(null)
  const [localStream, setLocalStream] = useState(null)
  const [screenStream, setScreenStream] = useState(null)
  const [remoteStreams, setRemoteStreams] = useState(new Map())
  const [remoteScreenStreams, setRemoteScreenStreams] = useState(new Map())
  const [participants, setParticipants] = useState([])
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [roomInfo, setRoomInfo] = useState(null)
  const [isHost, setIsHost] = useState(false)
  const [userRole, setUserRole] = useState(null) // 'co-host' or null
  const [joinRequests, setJoinRequests] = useState([]) // Waiting participants
  const [isWaiting, setIsWaiting] = useState(false) // Am I waiting for approval?
  const [allowParticipantScreenShare, setAllowParticipantScreenShare] = useState(true)
  const [allowSelfUnmute, setAllowSelfUnmute] = useState(true)
  const [handRaised, setHandRaised] = useState(false) // My own raised-hand state
  const [floatingReactions, setFloatingReactions] = useState([]) // Google Meet style float-up-and-fade reactions, see ReactionOverlay
  const [captions, setCaptions] = useState([]) // Recent live-caption lines (self-clearing)
  const [isRecording, setIsRecording] = useState(false) // Local (camera+mic) recording, see startRecording
  const [showWhiteboard, setShowWhiteboard] = useState(false)
  // If this room is a breakout, { mainRoomId, breakoutTitle } - read from
  // sessionStorage (set right before navigating here). Doesn't need to be
  // state: it's only ever set once, before this component mounts for this
  // roomId, and a move to a different breakout/back to main is itself a
  // navigation that remounts this component against a new roomId.
  const breakoutInfo = (() => {
    try {
      const raw = sessionStorage.getItem(`rumo_breakout_of_${roomId}`)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })()

  // Media states - use preferences from sessionStorage
  const [audioEnabled, setAudioEnabled] = useState(mediaPreferences.audio !== false)
  const [videoEnabled, setVideoEnabled] = useState(mediaPreferences.video !== false)
  const [screenSharing, setScreenSharing] = useState(false)
  const [facingMode, setFacingMode] = useState('user') // 'user' = front, 'environment' = back

  // UI states
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('participants')
  const [viewMode, setViewMode] = useState('grid') // 'grid', 'speaker', 'interview'
  const [showControls, setShowControls] = useState(true)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [showScreenShareDropdown, setShowScreenShareDropdown] = useState(false)
  const [showLayoutMenu, setShowLayoutMenu] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pinnedVideo, setPinnedVideo] = useState(null)
  const [debugLogs, setDebugLogs] = useState([])
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  const [localStreamVersion, setLocalStreamVersion] = useState(0) // Force video re-render
  const [remoteStreamVersions, setRemoteStreamVersions] = useState(new Map()) // Track remote stream versions for re-render
  const [isPageVisible, setIsPageVisible] = useState(true)
  const [wakeLock, setWakeLock] = useState(null)

  // Settings
  const { settings, updateSetting, resetSettings } = useSettings()
  const { getConstraints } = useMediaConstraints(settings)

  // Live captions: browser-only speech-to-text of your own mic (see
  // docs/EMBEDDING.md's feature list and useLiveCaptions.js). What gets
  // recognized is relayed to the room via 'send-caption' so everyone sees
  // it, not just you.
  useLiveCaptions({
    enabled: settings.liveCaptions && audioEnabled,
    onResult: (text) => socket?.emit('send-caption', { roomId, text })
  })

  // Refs
  const peerConnections = useRef(new Map())
  const socketUserId = useRef(userId)
  const controlsTimeoutRef = useRef()
  const peerStreamCount = useRef(new Map()) // Track number of video streams per peer
  const localStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const userNameRef = useRef(userName)
  const isHostRef = useRef(isHost)
  const userRoleRef = useRef(userRole)
  const blurProcessorRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const originalVideoTrackRef = useRef(null) // Store original video track
  const noiseSuppressorRef = useRef(null) // Noise suppression processor
  const originalAudioTrackRef = useRef(null) // Store original audio track
  const isInitialNoiseSuppressionMount = useRef(true) // Track initial mount for noise suppression
  const isFlippingCamera = useRef(false) // Prevent multiple simultaneous flips
  const activeTabRef = useRef(activeTab)
  const sidebarOpenRef = useRef(sidebarOpen)
  const hasConnectedBeforeRef = useRef(false) // Distinguishes the first 'connect' from a later reconnect
  const hasJoinedRoomOnceRef = useRef(false) // Distinguishes the first 'room-users' from a rejoin-after-reconnect
  const reconnectGraceTimeoutRef = useRef(null)

  // Debug log helper for mobile
  const addDebugLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    setDebugLogs(prev => [...prev.slice(-50), { timestamp, message, type }]) // Keep last 50 logs
    console.log(`[Debug ${type.toUpperCase()}]`, message)
  }, [])

  // Update refs when values change
  useEffect(() => {
    userNameRef.current = userName
    isHostRef.current = isHost
    userRoleRef.current = userRole
  }, [userName, isHost, userRole])

  // Read by the 'new-message' socket handler, registered once in a large
  // effect that doesn't re-run on every tab switch - without this it would
  // always see whatever tab/sidebar state was true at the moment the socket
  // connected, not the current one.
  useEffect(() => {
    activeTabRef.current = activeTab
    sidebarOpenRef.current = sidebarOpen
  }, [activeTab, sidebarOpen])

  useEffect(() => {
    setViewMode(settings.layout || 'grid')
  }, [settings.layout])

  // Fetch room info before connecting the socket. There's no account system
  // to verify host identity against, so the initial host guess here is just
  // "was this tab confirmed as host earlier in this room" (see the
  // 'host-status'/'new-host' socket handlers below, which are the real
  // source of truth and update this after the server confirms it).
  const [roomInfoLoaded, setRoomInfoLoaded] = useState(false)

  useEffect(() => {
    const fetchRoomInfo = async () => {
      try {
        const response = await api.get(`/api/rooms/${roomId}`)
        setRoomInfo(response.data.data)
        setIsHost(sessionStorage.getItem(`rumo_host_${roomId}`) === 'true')
        setRoomInfoLoaded(true)
      } catch (error) {
        console.error('Failed to fetch room info:', error)
        setRoomInfoLoaded(true) // Still allow connection even if fetch fails
      }
    }

    if (roomId) {
      fetchRoomInfo()
    }
  }, [roomId])

  // Debug: Log participants state changes
  useEffect(() => {

  }, [participants])

  // Initialize media - only once on mount
  const initializeMedia = useCallback(async () => {
    try {
      // Get quality-based constraints (includes noise suppression setting)
      const constraints = getConstraints({ 
        video: true, 
        audio: true,
        facingMode // Use front camera by default on mobile
      })
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      
      // Process audio with advanced noise suppression if enabled
      let finalStream = stream
      const audioTrack = stream.getAudioTracks()[0]
      if (audioTrack && settings.noiseSuppression) {
        try {
          // Store original audio track
          originalAudioTrackRef.current = audioTrack.clone()
          
          // Apply advanced noise gate
          const { stream: processedStream, processor } = await createNoiseSuppressor(
            new MediaStream([audioTrack]),
            true // Use advanced noise gate
          )
          
          const processedAudioTrack = processedStream.getAudioTracks()[0]
          if (processedAudioTrack) {
            // Replace audio track with noise-gated version
            finalStream.removeTrack(audioTrack)
            finalStream.addTrack(processedAudioTrack)
            noiseSuppressorRef.current = processor
          }
        } catch (noiseError) {
          console.error('Noise gate failed:', noiseError)
          // Continue with original audio track
          if (audioTrack) {
            originalAudioTrackRef.current = audioTrack.clone()
          }
        }
      } else if (audioTrack) {
        // No noise suppression - just store original
        originalAudioTrackRef.current = audioTrack.clone()
      }
      
      // Store original video track before any processing
      const videoTrack = finalStream.getVideoTracks()[0]
      if (videoTrack) {
        originalVideoTrackRef.current = videoTrack.clone()
      }
      
      // Apply background blur/replacement if enabled
      if ((settings.backgroundBlur || settings.backgroundImage) && videoTrack) {
        try {
          // Create video element for blur processor
          const videoElement = document.createElement('video')
          videoElement.srcObject = finalStream
          videoElement.autoplay = true
          videoElement.muted = true
          await videoElement.play()
          
          // Try BackgroundBlurProcessor first (with person segmentation)
          try {
            if (!blurProcessorRef.current) {
              blurProcessorRef.current = new BackgroundBlurProcessor(15, settings.backgroundImage)
              await blurProcessorRef.current.init()
              toast.success('Background blur with person detection enabled')
            }
          } catch (mlError) {
            console.warn('ML-based blur failed, using simple blur:', mlError)
            // Fall back to simple blur
            if (blurProcessorRef.current) {
              blurProcessorRef.current.stop()
            }
            blurProcessorRef.current = new SimpleBackgroundBlurProcessor(15, settings.backgroundImage)
            toast.success('Background blur enabled (simple mode)')
          }
          
          // Start blur processing
          const blurredStream = await blurProcessorRef.current.start(videoElement)
          
          // Replace video track with blurred version
          const blurredVideoTrack = blurredStream.getVideoTracks()[0]
          finalStream.removeTrack(videoTrack)
          finalStream.addTrack(blurredVideoTrack)
          
          // Stop original track since we're using the blurred one
          videoTrack.stop()
        } catch (blurError) {
          console.error('Background blur failed:', blurError)
          toast.error('Background blur failed, using regular video')
        }
      }
      
      setLocalStream(finalStream)
      localStreamRef.current = finalStream
      return finalStream
    } catch (error) {
      console.error('Media access failed:', error)
      
      // Try fallback constraints for mobile browsers
      try {
        console.log('Trying fallback constraints for mobile...')
        const fallbackConstraints = {
          video: {
            facingMode: facingMode,
            width: { ideal: 640 },
            height: { ideal: 480 }
          },
          audio: true
        }
        
        const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints)
        setLocalStream(fallbackStream)
        localStreamRef.current = fallbackStream
        toast.success('Camera/microphone access granted (basic mode)')
        return fallbackStream
      } catch (fallbackError) {
        console.error('Fallback media access also failed:', fallbackError)
        toast.error('Camera/microphone access failed. Please check permissions.')
        return null
      }
    }
  }, [facingMode, settings.backgroundBlur, settings.backgroundImage, settings.videoQuality, settings.noiseSuppression, getConstraints])

  // Socket connection and event handlers - wait for room info
  useEffect(() => {
    if (!roomInfoLoaded) return // Wait for room info to load first
    
    let mounted = true
    let currentSocket = null
    let hasJoined = false
    
    const initializeConnection = async () => {
      if (!mounted || hasJoined) return
      hasJoined = true
      
      currentSocket = io(SOCKET_URL)
      setSocket(currentSocket)

      const stream = await initializeMedia()
      if (!mounted) return

      // Send different event based on host status to avoid waiting room
      if (isHostRef.current) {
        let hostToken = null
        try {
          hostToken = sessionStorage.getItem(`rumo_host_token_${roomId}`)
        } catch {
          // ignore - private browsing etc.
        }
        currentSocket.emit('host-rejoin', {
          roomId,
          userId: socketUserId.current,
          userName: userNameRef.current,
          audioEnabled,
          videoEnabled,
          hostToken
        })
      } else {
        currentSocket.emit('request-join', {
          roomId,
          userId: socketUserId.current,
          userName: userNameRef.current,
          audioEnabled,
          videoEnabled,
          pin: mediaPreferences.pin
        })
      }

      currentSocket.on('room-users', (users) => {
        if (!mounted) return

        toast.dismiss('rumo-reconnect')
        if (hasJoinedRoomOnceRef.current) {
          toast.success('Reconnected', { duration: 2000 })
        } else {
          hasJoinedRoomOnceRef.current = true
          playYouJoined()
        }
        postToParent('videoConferenceJoined', { roomId })
        setParticipants(users)
        if (users.length > 0) {
          setTimeout(() => {
            if (!mounted || !stream) return
            users.forEach(user => {

              createPeerConnection(user.socketId, stream, currentSocket)
            })
          }, 1000)
        }
      })

      currentSocket.on('user-joined', (user) => {
        if (!mounted) return

        playUserJoined()
        postToParent('participantJoined', { id: user.socketId, displayName: user.name })
        setParticipants(prev => prev.find(p => p.socketId === user.socketId) ? prev : [...prev, user])
        setTimeout(() => {
          if (!mounted || !stream) return

          createPeerConnection(user.socketId, stream, currentSocket)
        }, 800)
        toast.success(`${user.name} joined`)
      })

      currentSocket.on('user-audio-toggle', ({ socketId, enabled }) => {
        if (!mounted) return

        setParticipants(prev => {
          const updated = prev.map(p => p.socketId === socketId ? { ...p, audioEnabled: enabled } : p)

          return updated
        })
      })

      currentSocket.on('user-video-toggle', ({ socketId, enabled }) => {
        if (!mounted) return

        setParticipants(prev => {
          const updated = prev.map(p => p.socketId === socketId ? { ...p, videoEnabled: enabled } : p)

          return updated
        })
      })

      currentSocket.on('user-left', ({ userId, socketId }) => {
        if (!mounted) return

        playUserLeft()
        postToParent('participantLeft', { id: socketId || userId })
        setParticipants(prev => prev.filter(p => p.id !== userId))
        setRemoteStreams(prev => {
          const newMap = new Map(prev)
          newMap.delete(socketId || userId)
          return newMap
        })
        setRemoteScreenStreams(prev => {
          const newMap = new Map(prev)
          // Remove all screen shares from this user (they might have multiple)
          Array.from(newMap.keys()).forEach(key => {
            if (key.startsWith((socketId || userId) + '-screen')) {
              newMap.delete(key)
            }
          })
          return newMap
        })
        peerStreamCount.current.delete(socketId || userId)
        const pc = peerConnections.current.get(socketId || userId)
        if (pc) {
          pc.close()
          peerConnections.current.delete(socketId || userId)
        }
      })

      currentSocket.on('offer', async ({ sender, offer }) => {
        if (!mounted) return
        let pc = peerConnections.current.get(sender)
        if (!pc) {
          pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
          
          if (stream) stream.getTracks().forEach(track => pc.addTrack(track, stream))
          
      pc.ontrack = (event) => {
        addDebugLog(`[RECEIVER] ontrack event - kind: ${event.track.kind}, id: ${event.track.id}, label: ${event.track.label}, readyState: ${event.track.readyState}, enabled: ${event.track.enabled}, muted: ${event.track.muted}`, 'info')
        
        // CRITICAL CHECK: Warn if receiving a muted video track
        if (event.track.kind === 'video' && event.track.muted) {
          addDebugLog(`⚠️ WARNING: Received MUTED video track! This will appear frozen!`, 'error')
        }

        if (event.streams && event.streams[0]) {
          const stream = event.streams[0]
          const streamId = stream.id
          const track = event.track
          
          addDebugLog(`[RECEIVER] Stream ID: ${streamId}, tracks: ${stream.getTracks().length}, sender: ${sender?.substring(0, 8)}`, 'info')
          
          // Monitor track state changes
          track.onended = () => {
            addDebugLog(`[RECEIVER] Track ended - kind: ${track.kind}, id: ${track.id}`, 'warning')

            if (track.kind === 'video') {
              // Remove the ended screen share stream
              setRemoteScreenStreams(prev => {
                const newMap = new Map(prev)
                const key = sender + '-screen-' + streamId
                if (newMap.has(key)) {
                  addDebugLog(`[RECEIVER] Removing screen share stream: ${key}`, 'info')
                  newMap.delete(key)
                }
                return newMap
              })
            }
          }
          
          track.onmute = () => {
            addDebugLog(`[RECEIVER] Track muted - kind: ${track.kind}, id: ${track.id}`, 'warning')
          }
          
          track.onunmute = () => {
            addDebugLog(`[RECEIVER] Track unmuted - kind: ${track.kind}, id: ${track.id}`, 'success')
          }
          
          // Handle stream removetrack event (when track is removed during renegotiation)
          stream.onremovetrack = (e) => {
            addDebugLog(`[RECEIVER] Stream removetrack - kind: ${e.track.kind}, id: ${e.track.id}`, 'warning')

            if (e.track.kind === 'video') {
              setRemoteScreenStreams(prev => {
                const newMap = new Map(prev)
                const key = sender + '-screen-' + streamId
                if (newMap.has(key)) {
                  addDebugLog(`[RECEIVER] Removing screen share after removetrack: ${key}`, 'info')
                  newMap.delete(key)
                }
                return newMap
              })
            }
          }
          
          stream.onaddtrack = (e) => {
            addDebugLog(`[RECEIVER] Stream addtrack - kind: ${e.track.kind}, id: ${e.track.id}, label: ${e.track.label}`, 'success')
          }
          
          if (event.track.kind === 'video') {
            const settings = event.track.getSettings()
            addDebugLog(`[RECEIVER] Video track settings: ${JSON.stringify({
              width: settings.width,
              height: settings.height,
              facingMode: settings.facingMode,
              deviceId: settings.deviceId?.substring(0, 20),
              displaySurface: settings.displaySurface
            })}`, 'info')

            // Note: deliberately not using a raw "settings.width > 1280" fallback here.
            // A camera on the "High" quality preset also requests up to 1920px wide, which
            // would otherwise misclassify a perfectly normal camera track as a screen share
            // on the very first video track received from a peer. displaySurface/deviceId
            // are reliable in every browser that can screen share at all, and currentCount
            // correctly catches a second video track arriving from the same peer.
            const isScreenShare = settings.displaySurface === 'monitor' ||
                                 settings.displaySurface === 'window' ||
                                 settings.displaySurface === 'browser' ||
                                 (settings.deviceId && settings.deviceId.startsWith('screen:'))

            const currentCount = peerStreamCount.current.get(sender) || 0
            
            if (isScreenShare || currentCount > 0) {
              const key = sender + '-screen-' + streamId
              addDebugLog(`[RECEIVER] Adding SCREEN SHARE stream: ${key}`, 'success')

              setRemoteScreenStreams(prev => {
                const newMap = new Map(prev)
                // Use stream ID to allow multiple screen shares
                newMap.set(key, stream)
                return newMap
              })
            } else {
              addDebugLog(`[RECEIVER] Adding CAMERA stream for peer: ${sender?.substring(0, 8)}`, 'success')
              peerStreamCount.current.set(sender, currentCount + 1)
              setRemoteStreams(prev => {
                const newMap = new Map(prev)
                newMap.set(sender, stream)
                return newMap
              })
            }
          } else {
            addDebugLog(`[RECEIVER] Adding AUDIO-ONLY stream for peer: ${sender?.substring(0, 8)}`, 'info')
            setRemoteStreams(prev => {
              const newMap = new Map(prev)
              if (!newMap.has(sender)) {
                newMap.set(sender, stream)
              }
              return newMap
            })
          }
        }
      }
          
          pc.onicecandidate = (event) => {
            if (event.candidate && mounted) {
              currentSocket.emit('ice-candidate', { target: sender, candidate: event.candidate })
            }
          }

          // Monitor connection state
          pc.onconnectionstatechange = () => {
            addDebugLog(`[PEER] Connection state: ${pc.connectionState} for ${sender?.substring(0, 8)}`, 
              pc.connectionState === 'connected' ? 'success' : 
              pc.connectionState === 'failed' || pc.connectionState === 'closed' ? 'error' : 'warning')

            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
              addDebugLog(`[PEER] Cleaning up failed/closed connection: ${sender?.substring(0, 8)}`, 'warning')
              peerConnections.current.delete(sender)
              setRemoteStreams(prev => {
                const newMap = new Map(prev)
                newMap.delete(sender)
                return newMap
              })
            }
          }
          
          peerConnections.current.set(sender, pc)
        }
        
        try {

          await pc.setRemoteDescription(new RTCSessionDescription(offer))

          // Only clean up removed tracks during renegotiation (not initial connection)
          // Check if this is a renegotiation by seeing if we already have screen shares from this sender
          const existingScreenShares = Array.from(remoteScreenStreams.keys()).filter(key => key.startsWith(sender + '-screen-'))

          if (existingScreenShares.length > 0) {

            // This is a renegotiation - check if tracks were removed or ended
            const transceivers = pc.getTransceivers()

            const activeVideoStreamIds = new Set()
            
            // Collect all active video stream IDs from transceivers
            transceivers.forEach((transceiver, idx) => {
              if (transceiver.receiver && transceiver.receiver.track) {
                const track = transceiver.receiver.track
                const streams = transceiver.receiver.streams

                // Only count as active if:
                // 1. Track is video
                // 2. Track is not ended
                // 3. Transceiver is not stopped or inactive
                if (track.kind === 'video' && 
                    track.readyState === 'live' && 
                    !transceiver.stopped &&
                    transceiver.direction !== 'inactive' &&
                    streams && streams.length > 0) {
                  streams.forEach(stream => {
                    activeVideoStreamIds.add(stream.id)

                  })
                }
              }
            })
            

            // Clean up screen shares that are no longer in active video streams
            setRemoteScreenStreams(prev => {
              const newMap = new Map(prev)
              let hasChanges = false
              
              existingScreenShares.forEach(key => {
                const stream = newMap.get(key)
                if (stream) {
                  const streamId = stream.id
                  // Remove if this stream ID is not in the active video streams
                  if (!activeVideoStreamIds.has(streamId)) {
                    newMap.delete(key)
                    hasChanges = true
                  } else {
                  }
                } else {

                }
              })
              
              return hasChanges ? newMap : prev
            })
          } else {
          }
          
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          currentSocket.emit('answer', { target: sender, answer })
        } catch (error) {
          console.error('Error handling offer:', error)
        }
      })

      currentSocket.on('answer', async ({ sender, answer }) => {
        if (!mounted) return
        const pc = peerConnections.current.get(sender)
        // A duplicate/late-arriving answer for a connection that's already
        // stable would throw (setRemoteDescription only accepts an answer
        // while in 'have-local-offer'); ignore it instead of erroring out
        // and leaving the peer connection stuck without media.
        if (pc && pc.signalingState === 'have-local-offer') {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer))
          } catch (error) {
            console.error('Error handling answer:', error)
          }
        } else if (pc) {
          addDebugLog(`[PEER] Ignoring stale answer from ${sender?.substring(0, 8)} (state: ${pc.signalingState})`, 'warning')
        }
      })

      currentSocket.on('ice-candidate', async ({ sender, candidate }) => {
        if (!mounted) return
        const pc = peerConnections.current.get(sender)
        if (pc && candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate))
          } catch (error) {
            console.error('Error adding ICE candidate:', error)
          }
        }
      })

      currentSocket.on('new-message', (message) => {
        if (!mounted) return
        setMessages(prev => [...prev, message])

        const isOwnMessage = message.userName === userNameRef.current
        const viewingChat = sidebarOpenRef.current && activeTabRef.current === 'chat'
        if (!isOwnMessage && !viewingChat) {
          playChatMessage()
          const preview = message.type === 'file'
            ? `📎 ${message.fileName || 'sent a file'}`
            : String(message.message || '').slice(0, 80)
          toast(`${message.userName}: ${preview}`, { duration: 3000, icon: '💬' })
        }
      })

      currentSocket.on('force-mute', () => {
        if (!mounted) return
        setAudioEnabled(false)
        if (localStream) localStream.getAudioTracks().forEach(track => track.enabled = false)
        toast.error('You have been muted by the host')
      })

      currentSocket.on('force-video-off', ({ by }) => {
        if (!mounted) return
        setVideoEnabled(false)
        if (localStream) localStream.getVideoTracks().forEach(track => track.enabled = false)
        toast.error(`Your camera was disabled by ${by}`)
      })

      currentSocket.on('force-stop-screenshare', ({ by }) => {
        if (!mounted) return
        if (screenSharing) {
          stopScreenShare()
          toast.error(`Your screen share was stopped by ${by}`)
        }
      })

      currentSocket.on('role-changed', ({ role, by }) => {
        if (!mounted) return
        setUserRole(role) // Update user's role
        if (role === 'co-host') {
          toast.success(`You are now a co-host! (by ${by})`, { duration: 4000 })
        } else {
          toast(`You are now a participant (by ${by})`, { duration: 4000 })
        }
      })

      currentSocket.on('participant-role-updated', ({ socketId, role, name }) => {
        if (!mounted) return
        setParticipants(prev => prev.map(p => 
          p.socketId === socketId ? { ...p, role } : p
        ))
        if (role === 'co-host') {
          toast.success(`${name} is now a co-host`)
        } else {
          toast(`${name} is now a participant`)
        }
      })

      currentSocket.on('kicked-from-room', ({ by }) => {
        if (!mounted) return
        stopAllMedia({ closePeers: true })
        playRemoved()
        toast.error(`You were removed from the meeting by ${by}`)
        setTimeout(() => navigate('/'), 2000)
      })

      currentSocket.on('all-participants-muted', ({ by }) => {
        if (!mounted) return
        // Mute the current user if they're not host/co-host
        if (!isHostRef.current && userRoleRef.current !== 'co-host') {
          setAudioEnabled(false)
          if (localStream) localStream.getAudioTracks().forEach(track => track.enabled = false)
        }
        toast(`All participants muted by ${by}`)
      })

      currentSocket.on('chat-status-changed', ({ enabled, by }) => {
        if (!mounted) return
        toast(`Chat ${enabled ? 'enabled' : 'disabled'} by ${by}`)
      })

      currentSocket.on('room-type-changed', ({ isPrivate, by }) => {
        if (!mounted) return
        toast(`Room is now ${isPrivate ? 'Private' : 'Public'} (by ${by})`)
      })

      currentSocket.on('all-cameras-disabled', ({ by }) => {
        if (!mounted) return
        // Disable video for current user if they're not host/co-host
        if (!isHostRef.current && userRoleRef.current !== 'co-host') {
          setVideoEnabled(false)
          if (localStream) localStream.getVideoTracks().forEach(track => track.enabled = false)
        }
        toast(`All cameras disabled by ${by}`)
      })

      currentSocket.on('room-settings', (settings) => {
        if (!mounted) return
        // Apply room settings received when joining (includes chat disabled state)
        if (settings.chatEnabled === false) {
          // Chat is disabled, will be handled by MeetingSidebar
        }
        if (settings.allMuted && !isHostRef.current && userRoleRef.current !== 'co-host') {
          setAudioEnabled(false)
          if (localStream) localStream.getAudioTracks().forEach(track => track.enabled = false)
        }
        if (settings.allCamerasOff && !isHostRef.current && userRoleRef.current !== 'co-host') {
          setVideoEnabled(false)
          if (localStream) localStream.getVideoTracks().forEach(track => track.enabled = false)
        }
        if (settings.allowParticipantScreenShare !== undefined) {
          setAllowParticipantScreenShare(settings.allowParticipantScreenShare)
        }
        if (settings.allowSelfUnmute !== undefined) {
          setAllowSelfUnmute(settings.allowSelfUnmute)
        }
      })

      currentSocket.on('participant-screenshare-permission-changed', ({ enabled }) => {
        if (!mounted) return
        setAllowParticipantScreenShare(enabled)
      })

      currentSocket.on('self-unmute-permission-changed', ({ enabled }) => {
        if (!mounted) return
        setAllowSelfUnmute(enabled)
      })

      currentSocket.on('hand-raised', ({ socketId, userName }) => {
        if (!mounted) return
        setParticipants(prev => prev.map(p => p.socketId === socketId ? { ...p, handRaised: true } : p))
        toast(`✋ ${userName} raised their hand`, { duration: 3000 })
        playHandRaised()
      })

      currentSocket.on('hand-lowered', ({ socketId }) => {
        if (!mounted) return
        setParticipants(prev => prev.map(p => p.socketId === socketId ? { ...p, handRaised: false } : p))
      })

      currentSocket.on('reaction-received', ({ emoji }) => {
        if (!mounted) return
        const id = `${Date.now()}-${Math.random()}`
        setFloatingReactions(prev => [...prev, { id, emoji, x: 15 + Math.random() * 70 }])
        setTimeout(() => {
          setFloatingReactions(prev => prev.filter(r => r.id !== id))
        }, 3000)
        playReaction()
      })

      currentSocket.on('breakout-assigned', ({ breakoutRoomId, breakoutTitle, mainRoomId }) => {
        if (!mounted) return
        try {
          sessionStorage.setItem(`rumo_breakout_of_${breakoutRoomId}`, JSON.stringify({ mainRoomId, breakoutTitle }))
        } catch {
          // ignore - private browsing etc.
        }
        toast.success(`Moved to ${breakoutTitle}`)
        navigate(`/m/${breakoutRoomId}`, { state: { fromPreJoin: true } })
      })

      currentSocket.on('breakout-closed', ({ mainRoomId }) => {
        if (!mounted) return
        try {
          sessionStorage.removeItem(`rumo_breakout_of_${roomId}`)
        } catch {
          // ignore - private browsing etc.
        }
        toast('Breakout rooms closed - back to the main room')
        navigate(`/m/${mainRoomId}`, { state: { fromPreJoin: true } })
      })

      currentSocket.on('caption-received', ({ socketId, userName, text }) => {
        if (!mounted) return
        const id = `${socketId}-${Date.now()}`
        setCaptions(prev => [...prev.slice(-2), { id, userName, text }])
        setTimeout(() => {
          if (mounted) setCaptions(prev => prev.filter(c => c.id !== id))
        }, 6000)
      })

      // Authoritative host status for this tab - there's no account system,
      // so this (and 'new-host' below) is the only source of truth. hostToken
      // is what proves that to the server again on 'host-rejoin' - a bare
      // "isHost: true" claim on its own is no longer trusted server-side.
      currentSocket.on('host-status', ({ isHost: confirmedHost, hostToken }) => {
        if (!mounted) return
        postToParent('hostStatusChanged', { isHost: confirmedHost })
        setIsHost(confirmedHost)
        try {
          sessionStorage.setItem(`rumo_host_${roomId}`, confirmedHost ? 'true' : 'false')
          if (confirmedHost && hostToken) {
            sessionStorage.setItem(`rumo_host_token_${roomId}`, hostToken)
          } else if (!confirmedHost) {
            sessionStorage.removeItem(`rumo_host_token_${roomId}`)
          }
        } catch {
          // ignore - private browsing etc.
        }
      })

      currentSocket.on('new-host', ({ socketId, hostName }) => {
        if (!mounted) return
        const becameHost = socketId === currentSocket.id
        if (becameHost) {
          setIsHost(true)
          try {
            sessionStorage.setItem(`rumo_host_${roomId}`, 'true')
          } catch {
            // ignore - private browsing etc.
          }
        }
        toast(becameHost ? 'You are now the host' : `${hostName} is now the host`)
      })

      currentSocket.on('all-screenshares-disabled', ({ by }) => {
        if (!mounted) return
        // Stop screen sharing for current user if they're not host/co-host
        if (!isHostRef.current && userRoleRef.current !== 'co-host' && screenSharing) {
          stopScreenShare()
        }
        toast(`All screen shares stopped by ${by}`)
      })

      // Private room waiting room events
      currentSocket.on('waiting-for-approval', ({ message }) => {
        if (!mounted) return
        setIsWaiting(true)
        toast(message || 'Waiting for host approval...', { duration: 5000 })
      })

      currentSocket.on('join-request', ({ socketId, userName, profilePicture, timestamp }) => {
        if (!mounted) return
        // Backend already filters - only hosts/co-hosts receive this event
        console.log('[JOIN REQUEST] Received:', { socketId, userName, profilePicture, timestamp })
        
        // Play notification sound
        playJoinRequest()
        
        setJoinRequests(prev => {
          // Avoid duplicates
          if (prev.some(req => req.socketId === socketId)) {
            return prev
          }
          return [...prev, { socketId, userName, profilePicture, timestamp }]
        })
        toast(`${userName} wants to join the meeting`)
      })

      currentSocket.on('join-approved', ({ by }) => {
        if (!mounted) return
        setIsWaiting(false)
        toast.success(`You were approved by ${by}!`)
        // The backend will call handleJoinRoom now, which triggers room-users event
      })

      currentSocket.on('join-rejected', ({ by, message }) => {
        if (!mounted) return
        setIsWaiting(false)
        stopAllMedia({ closePeers: true })
        playRemoved()
        toast.error(message || `Your request was declined by ${by}`)
        setTimeout(() => navigate('/'), 3000)
      })

      currentSocket.on('removed-from-room', () => {
        if (!mounted) return
        stopAllMedia({ closePeers: true })
        playRemoved()
        toast.error('You have been removed from the meeting')
        setTimeout(() => navigate('/'), 2000)
      })

      currentSocket.on('session-replaced', ({ message }) => {
        if (!mounted) return
        stopAllMedia({ closePeers: true })
        playRemoved()
        toast.error(message || 'You joined from another window/device', { duration: 5000 })
        setTimeout(() => navigate('/'), 2000)
      })

      // socket.io reconnects the transport on its own (default options -
      // that's still just TCP/WS coming back, not room membership). A brief
      // network blip or the backend redeploying for a couple seconds
      // shouldn't instantly boot everyone off the call and drop their
      // camera, so give it a grace window to reconnect and rejoin before
      // treating the disconnect as terminal.
      currentSocket.on('disconnect', (reason) => {
        if (!mounted) return
        console.log('Socket disconnected:', reason)
        addDebugLog(`Disconnected: ${reason}`, 'warning')

        // A manual disconnect (Leave button, e.g.) needs no recovery/toast.
        if (reason === 'io client disconnect') return

        toast.loading('Connection lost, trying to reconnect...', { id: 'rumo-reconnect', duration: Infinity })
        reconnectGraceTimeoutRef.current = setTimeout(() => {
          if (!mounted) return
          toast.dismiss('rumo-reconnect')
          stopAllMedia({ closePeers: true })
          playRemoved()
          toast.error('Connection lost. Your media has been stopped.', { duration: 3000 })
          setTimeout(() => navigate('/'), 2500)
        }, RECONNECT_GRACE_MS)
      })

      currentSocket.on('connect', () => {
        if (!mounted) return

        // The very first connection is handled by initializeConnection()'s
        // own host-rejoin/request-join call above - this branch is only for
        // a reconnect after the 'disconnect' handler above already fired.
        if (!hasConnectedBeforeRef.current) {
          hasConnectedBeforeRef.current = true
          return
        }

        if (reconnectGraceTimeoutRef.current) {
          clearTimeout(reconnectGraceTimeoutRef.current)
          reconnectGraceTimeoutRef.current = null
        }

        addDebugLog('Reconnected - rejoining room', 'info')

        // The old peer connections died with the transport; discard them so
        // the room-users handler below creates fresh ones once we rejoin,
        // exactly like a first-time join would.
        peerConnections.current.forEach(pc => pc.close())
        peerConnections.current.clear()
        peerStreamCount.current.clear()
        setRemoteStreams(new Map())
        setRemoteScreenStreams(new Map())

        let hostToken = null
        try {
          hostToken = sessionStorage.getItem(`rumo_host_token_${roomId}`)
        } catch {
          // ignore - private browsing etc.
        }

        if (isHostRef.current && hostToken) {
          currentSocket.emit('host-rejoin', {
            roomId,
            userId: socketUserId.current,
            userName: userNameRef.current,
            audioEnabled,
            videoEnabled,
            hostToken
          })
        } else {
          currentSocket.emit('request-join', {
            roomId,
            userId: socketUserId.current,
            userName: userNameRef.current,
            audioEnabled,
            videoEnabled,
            pin: mediaPreferences.pin
          })
        }
      })

      // Handle connection errors
      currentSocket.on('connect_error', (error) => {
        if (!mounted) return
        console.error('Socket connection error:', error)
        addDebugLog(`Connection error: ${error.message}`, 'error')
        toast.error('Failed to connect to meeting server')
      })
      
      // Handle camera flip notifications from other users
      currentSocket.on('camera-flipped', ({ userId, socketId, facingMode, trackId, timestamp }) => {
        if (!mounted) return
        console.log('[CameraFlip] Peer flipped camera:', { userId, socketId, facingMode, trackId, timestamp })
        addDebugLog(`[RECEIVER] 📹 Peer ${socketId?.substring(0, 8)} flipped camera to ${facingMode}, trackId: ${trackId}`, 'info')
        
        // Log current remote stream state
        const currentStream = remoteStreams.get(socketId)
        if (currentStream) {
          const tracks = currentStream.getTracks()
          addDebugLog(`[RECEIVER] Current remote stream has ${tracks.length} tracks`, 'info')
          tracks.forEach(track => {
            addDebugLog(`[RECEIVER] - ${track.kind} track: ${track.id}, readyState: ${track.readyState}, enabled: ${track.enabled}, muted: ${track.muted}`, 'info')
          })
        } else {
          addDebugLog(`[RECEIVER] ⚠️ No remote stream found for peer ${socketId?.substring(0, 8)}`, 'warning')
        }
        
        // Increment version for this remote peer to force video re-render
        setRemoteStreamVersions(prev => {
          const newMap = new Map(prev)
          const currentVersion = newMap.get(socketId) || 0
          newMap.set(socketId, currentVersion + 1)
          addDebugLog(`[RECEIVER] Incrementing video version for peer ${socketId?.substring(0, 8)} to ${currentVersion + 1}`, 'info')
          return newMap
        })
        
        // Force re-render of remote streams to ensure video elements update
        addDebugLog('[RECEIVER] Forcing remote streams re-render...', 'info')
        setRemoteStreams(prev => {
          const newMap = new Map(prev)
          addDebugLog(`[RECEIVER] Remote streams count: ${newMap.size}`, 'info')
          return new Map(newMap)
        })
      })
    }
    
    initializeConnection()
    
    return () => {
      mounted = false
      if (reconnectGraceTimeoutRef.current) {
        clearTimeout(reconnectGraceTimeoutRef.current)
        reconnectGraceTimeoutRef.current = null
      }
      toast.dismiss('rumo-reconnect')
      stopAllMedia({ closePeers: true })
      if (currentSocket) currentSocket.disconnect()
    }
    // isHost is intentionally excluded: this effect's own 'host-status'/'new-host'
    // handlers are what set it, so depending on it here would tear down and
    // recreate the whole socket/peer-connection set the moment the server
    // confirms host status for every single participant, right as they join
    // (isHostRef above exists precisely so this effect can read the current
    // value without depending on it).
  }, [roomId, roomInfoLoaded, roomInfo]) // Wait for room info before connecting

  // Create peer connection
  const createPeerConnection = async (socketId, stream = null, socketRef = null) => {
    const activeSocket = socketRef || socket
    if (peerConnections.current.has(socketId)) return

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const currentStream = stream || localStream
    
    // Add camera/mic tracks
    if (currentStream) {
      currentStream.getTracks().forEach(track => {

        pc.addTrack(track, currentStream)
      })
    }
    
    // Add screen share tracks if screen sharing is active
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => {

        pc.addTrack(track, screenStreamRef.current)
      })
    }

    pc.ontrack = (event) => {

      if (event.streams && event.streams[0]) {
        const stream = event.streams[0]
        const streamId = stream.id
        const track = event.track
        
        // Handle track ended event
        track.onended = () => {

          if (track.kind === 'video') {
            // Remove the ended screen share stream
            setRemoteScreenStreams(prev => {
              const newMap = new Map(prev)
              const key = socketId + '-screen-' + streamId
              if (newMap.has(key)) {

                newMap.delete(key)
              }
              return newMap
            })
          }
        }
        
        // Handle stream removetrack event (when track is removed during renegotiation)
        stream.onremovetrack = (e) => {

          if (e.track.kind === 'video') {
            setRemoteScreenStreams(prev => {
              const newMap = new Map(prev)
              const key = socketId + '-screen-' + streamId
              if (newMap.has(key)) {

                newMap.delete(key)
              }
              return newMap
            })
          }
        }
        
        if (event.track.kind === 'video') {
          const settings = event.track.getSettings()

          // Check if screen share by properties. No raw resolution fallback -
          // see the matching comment in the other ontrack handler above; a
          // "High" quality camera also asks for up to 1920px wide.
          const isScreenShare = settings.displaySurface === 'monitor' ||
                               settings.displaySurface === 'window' ||
                               settings.displaySurface === 'browser' ||
                               (settings.deviceId && settings.deviceId.startsWith('screen:'))

          // Track video stream count
          const currentCount = peerStreamCount.current.get(socketId) || 0
          
          // If this is the second video stream, it's screen share
          if (isScreenShare || currentCount > 0) {
            const key = socketId + '-screen-' + streamId


            setRemoteScreenStreams(prev => {
              const newMap = new Map(prev)
              // Use stream ID to allow multiple screen shares
              newMap.set(key, stream)
              return newMap
            })
          } else {

            peerStreamCount.current.set(socketId, currentCount + 1)
            setRemoteStreams(prev => {
              const newMap = new Map(prev)
              newMap.set(socketId, stream)
              return newMap
            })
          }
        } else {
          // Audio track

          setRemoteStreams(prev => {
            const newMap = new Map(prev)
            if (!newMap.has(socketId)) {
              newMap.set(socketId, stream)
            }
            return newMap
          })
        }
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && activeSocket) {
        activeSocket.emit('ice-candidate', { target: socketId, candidate: event.candidate })
      }
    }

    // Monitor connection state to detect actual disconnects (not renegotiation)
    pc.onconnectionstatechange = () => {

      // Only clean up on actual failures, not during 'connecting' (renegotiation)
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {

        peerConnections.current.delete(socketId)
        setRemoteStreams(prev => {
          const newMap = new Map(prev)
          newMap.delete(socketId)
          return newMap
        })
      }
    }

    peerConnections.current.set(socketId, pc)

    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
      await pc.setLocalDescription(offer)
      if (activeSocket) activeSocket.emit('offer', { target: socketId, offer })
    } catch (error) {
      console.error('Error creating offer:', error)
    }
  }

  // Media controls
  const toggleAudio = () => {
    if (localStream) {
      const enabled = !audioEnabled

      if (enabled && !allowSelfUnmute && !isHost && userRole !== 'co-host') {
        toast.error('The host has disabled self-unmute')
        return
      }

      console.log(`[toggleAudio] Toggling audio from ${audioEnabled} to ${enabled}`)
      console.log('[toggleAudio] Current stream tracks:', {
        audio: localStream.getAudioTracks().map(t => ({ id: t.id, label: t.label, enabled: t.enabled })),
        video: localStream.getVideoTracks().map(t => ({ id: t.id, label: t.label, enabled: t.enabled }))
      })
      
      // Only toggle AUDIO tracks, not video
      const audioTracks = localStream.getAudioTracks()
      audioTracks.forEach(track => {
        console.log(`[toggleAudio] Setting audio track ${track.id} enabled to ${enabled}`)
        track.enabled = enabled
      })
      setAudioEnabled(enabled)
      postToParent('audioMuteStatusChanged', { muted: !enabled })
      socket?.emit('toggle-audio', { roomId, enabled })

      console.log('[toggleAudio] After toggle, stream tracks:', {
        audio: localStream.getAudioTracks().map(t => ({ id: t.id, label: t.label, enabled: t.enabled })),
        video: localStream.getVideoTracks().map(t => ({ id: t.id, label: t.label, enabled: t.enabled }))
      })
    }
  }

  const toggleVideo = () => {
    if (localStream) {
      const enabled = !videoEnabled
      console.log(`[toggleVideo] Toggling video from ${videoEnabled} to ${enabled}`)
      console.log('[toggleVideo] Current stream tracks:', {
        audio: localStream.getAudioTracks().map(t => ({ id: t.id, label: t.label, enabled: t.enabled })),
        video: localStream.getVideoTracks().map(t => ({ id: t.id, label: t.label, enabled: t.enabled }))
      })
      
      // Only toggle VIDEO tracks, not audio
      const videoTracks = localStream.getVideoTracks()
      videoTracks.forEach(track => {
        console.log(`[toggleVideo] Setting video track ${track.id} enabled to ${enabled}`)
        track.enabled = enabled
      })
      setVideoEnabled(enabled)
      postToParent('videoMuteStatusChanged', { muted: !enabled })
      socket?.emit('toggle-video', { roomId, enabled })

      console.log('[toggleVideo] After toggle, stream tracks:', {
        audio: localStream.getAudioTracks().map(t => ({ id: t.id, label: t.label, enabled: t.enabled })),
        video: localStream.getVideoTracks().map(t => ({ id: t.id, label: t.label, enabled: t.enabled }))
      })
    }
  }

  // Flip camera between front and back (for mobile/tablet)
  const flipCamera = async () => {
    // Prevent multiple simultaneous flips
    if (isFlippingCamera.current) {
      addDebugLog('⚠️ Camera flip already in progress, ignoring click', 'warning')
      return
    }
    
    try {
      isFlippingCamera.current = true
      const newFacingMode = facingMode === 'user' ? 'environment' : 'user'
      
      addDebugLog(`Starting flip from ${facingMode} to ${newFacingMode}`, 'info')
      console.log('[FlipCamera] Starting flip from', facingMode, 'to', newFacingMode)
      
      // Get new video stream with flipped camera - DIRECTLY use getUserMedia with explicit facingMode
      const constraints = {
        video: {
          facingMode: { exact: newFacingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false // Don't get audio, we'll preserve existing
      }
      
      addDebugLog(`Constraints: ${JSON.stringify(constraints.video)}`, 'info')
      console.log('[FlipCamera] Using constraints:', JSON.stringify(constraints))
      
      const newVideoStream = await navigator.mediaDevices.getUserMedia(constraints)
      let newVideoTrack = newVideoStream.getVideoTracks()[0]
      
      if (!newVideoTrack) {
        const error = 'Failed to get video track from new stream'
        addDebugLog(error, 'error')
        console.error('[FlipCamera]', error)
        toast.error(error)
        return
      }
      
      addDebugLog(`Got new track: ${newVideoTrack.id}, label: ${newVideoTrack.label}`, 'success')
      console.log('[FlipCamera] Got new video track:', newVideoTrack.id, 'readyState:', newVideoTrack.readyState)
      
      // Ensure track is enabled
      newVideoTrack.enabled = videoEnabled
      
      // Store as original track (clone it first to keep a clean copy)
      if (originalVideoTrackRef.current) {
        originalVideoTrackRef.current.stop()
      }
      originalVideoTrackRef.current = newVideoTrack.clone()
      
      // Apply background blur/replacement if enabled
      let finalVideoTrack = newVideoTrack
      if ((settings.backgroundBlur || settings.backgroundImage) && blurProcessorRef.current) {
        try {
          addDebugLog('Applying background blur...', 'info')
          console.log('[FlipCamera] Applying background blur to new camera')
          
          // Create video element for blur processor
          const videoElement = document.createElement('video')
          videoElement.srcObject = new MediaStream([newVideoTrack])
          videoElement.autoplay = true
          videoElement.muted = true
          videoElement.playsInline = true // Important for mobile
          
          // Wait for video to be ready
          await videoElement.play()
          await new Promise(resolve => {
            if (videoElement.readyState >= 2) {
              resolve()
            } else {
              videoElement.onloadeddata = () => resolve()
            }
          })
          
          // Apply blur
          const blurredStream = await blurProcessorRef.current.start(videoElement)
          const blurredVideoTrack = blurredStream.getVideoTracks()[0]
          
          if (blurredVideoTrack) {
            blurredVideoTrack.enabled = videoEnabled
            // Stop the unblurred original since we're using the blurred one
            newVideoTrack.stop()
            finalVideoTrack = blurredVideoTrack
            addDebugLog('Blur applied successfully', 'success')
            console.log('[FlipCamera] Applied blur successfully')
          }
        } catch (blurError) {
          addDebugLog(`Blur failed: ${blurError.message}`, 'error')
          console.error('[FlipCamera] Failed to apply blur:', blurError)
          if (isMobile) {
            toast.error(`Blur application failed: ${blurError.message || 'Unknown error'}`)
          }
          // Continue with unblurred track
          finalVideoTrack = newVideoTrack
        }
      }
      
      // Get current audio track to preserve it
      const currentAudioTrack = localStreamRef.current?.getAudioTracks()[0]
      
      // Get old video track to stop it
      const oldVideoTrack = localStreamRef.current?.getVideoTracks()[0]
      
      addDebugLog(`Old track: ${oldVideoTrack?.label || 'none'}`, 'info')
      
      // Create new stream with preserved audio and new video
      const updatedStream = new MediaStream()
      
      // Add audio track if it exists
      if (currentAudioTrack) {
        updatedStream.addTrack(currentAudioTrack)
        addDebugLog(`Preserved audio: ${currentAudioTrack.id}`, 'info')
        console.log('[FlipCamera] Preserved audio track:', currentAudioTrack.id)
      }
      
      // Add the final video track (blurred or unblurred)
      updatedStream.addTrack(finalVideoTrack)
      addDebugLog(`New stream has ${updatedStream.getTracks().length} tracks`, 'info')
      console.log('[FlipCamera] Added video track:', finalVideoTrack.id)
      
      console.log('[FlipCamera] Created new stream with', updatedStream.getTracks().length, 'tracks')
      
      // Replace video track in all peer connections (AWAIT each replacement)
      const replacePromises = []
      addDebugLog(`[SENDER] Starting track replacement for ${peerConnections.current.size} peers`, 'info')
      
      peerConnections.current.forEach((pc, socketId) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) {
          addDebugLog(`[SENDER] Found video sender for peer ${socketId.substring(0, 8)}, current track: ${sender.track?.id}`, 'info')
          replacePromises.push(
            sender.replaceTrack(finalVideoTrack)
              .then(() => {
                addDebugLog(`[SENDER] ✅ Replaced track for peer: ${socketId.substring(0, 8)}, new track: ${finalVideoTrack.id}, readyState: ${finalVideoTrack.readyState}, enabled: ${finalVideoTrack.enabled}`, 'success')
                
                // Verify the replacement
                const currentTrack = sender.track
                if (currentTrack && currentTrack.id === finalVideoTrack.id) {
                  addDebugLog(`[SENDER] ✓ Verified replacement - sender now has track ${currentTrack.id}`, 'success')
                } else {
                  addDebugLog(`[SENDER] ⚠️ Verification failed - sender has track ${currentTrack?.id} but expected ${finalVideoTrack.id}`, 'error')
                }
                
                console.log('[FlipCamera] Replaced track for peer:', socketId)
                return true
              })
              .catch(err => {
                addDebugLog(`[SENDER] ❌ Failed to replace for peer ${socketId.substring(0, 8)}: ${err.message}`, 'error')
                console.error('[FlipCamera] Failed to replace track for peer:', socketId, err)
                if (isMobile) {
                  toast.error(`Failed to update video for peer: ${err.message}`)
                }
                return false
              })
          )
        } else {
          addDebugLog(`[SENDER] ⚠️ No video sender found for peer ${socketId.substring(0, 8)}`, 'warning')
        }
      })
      
      // Wait for all replacements to complete
      const results = await Promise.all(replacePromises)
      const successCount = results.filter(r => r).length
      addDebugLog(`[SENDER] Replaced ${successCount}/${peerConnections.current.size} peer connections`, successCount === peerConnections.current.size ? 'success' : 'warning')
      console.log('[FlipCamera] Replaced video track in', successCount, '/', peerConnections.current.size, 'peer connections')
      
      if (isMobile && successCount < peerConnections.current.size) {
        toast.warning(`Camera switched, but ${peerConnections.current.size - successCount} peer(s) may not see the update`)
      }
      
      // Log all senders' current tracks to verify
      addDebugLog('[SENDER] Verifying all peer connections after replacement:', 'info')
      peerConnections.current.forEach((pc, socketId) => {
        const senders = pc.getSenders()
        const videoSender = senders.find(s => s.track?.kind === 'video')
        if (videoSender && videoSender.track) {
          addDebugLog(`[SENDER] Peer ${socketId.substring(0, 8)} video track: ${videoSender.track.id}, readyState: ${videoSender.track.readyState}, enabled: ${videoSender.track.enabled}`, 'info')
        } else {
          addDebugLog(`[SENDER] Peer ${socketId.substring(0, 8)} has NO video track!`, 'error')
        }
      })
      
      // Update local refs and state FIRST (before stopping old track)
      addDebugLog(`[SENDER] Updating localStreamRef and state...`, 'info')
      localStreamRef.current = updatedStream
      setLocalStream(updatedStream)
      setLocalStreamVersion(prev => prev + 1) // Force video re-render
      addDebugLog(`[UI] Forcing video element re-render (version: ${localStreamVersion + 1})`, 'info')
      setFacingMode(newFacingMode)
      
      // NOW stop old video track (after state is updated)
      if (oldVideoTrack) {
        addDebugLog(`[SENDER] Stopping old track: ${oldVideoTrack.id}`, 'info')
        console.log('[FlipCamera] Stopping old video track:', oldVideoTrack.id)
        oldVideoTrack.stop()
      }
      
      // Notify other peers about camera change
      if (socket) {
        socket.emit('camera-flipped', { 
          roomId, 
          facingMode: newFacingMode,
          trackId: finalVideoTrack.id
        })
        addDebugLog('Notified peers about camera flip', 'info')
      }
      
      addDebugLog(`✅ Camera flip to ${newFacingMode === 'user' ? 'FRONT' : 'BACK'} completed!`, 'success')
      toast.success(`Switched to ${newFacingMode === 'user' ? 'front' : 'back'} camera`)
      
      // Reset flip lock
      isFlippingCamera.current = false
    } catch (error) {
      // Reset flip lock on error
      isFlippingCamera.current = false
      
      addDebugLog(`❌ Error: ${error.name} - ${error.message}`, 'error')
      console.error('[FlipCamera] ❌ Failed:', error)
      
      // Show detailed error on mobile
      if (isMobile) {
        let errorMessage = 'Failed to switch camera'
        
        // Provide specific error messages based on error type
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Camera permission denied. Please allow camera access.'
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'Camera not found. Please check if camera is available.'
        } else if (error.name === 'NotReadableError') {
          errorMessage = 'Camera is already in use by another app.'
        } else if (error.name === 'OverconstrainedError') {
          errorMessage = 'Camera does not support the requested settings.'
        } else if (error.message) {
          errorMessage = `Camera error: ${error.message}`
        }
        
        toast.error(errorMessage, { duration: 4000 })
        console.log('[FlipCamera] Error shown to user:', errorMessage)
      } else {
        toast.error('Failed to switch camera. Please try again.')
      }
    }
  }

  const startScreenShare = async () => {
    try {
      // Check if screen sharing is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        if (isMobile) {
          toast.error('Screen sharing is not supported on mobile browsers. Please use desktop Chrome, Firefox, or Edge.')
        } else {
          toast.error('Screen sharing is not supported on this browser')
        }
        return
      }

      const displayMediaOptions = {
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: false // Don't request audio for better compatibility
      }

      const newScreenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions)

      setScreenStream(newScreenStream)
      screenStreamRef.current = newScreenStream
      setScreenSharing(true)
      setShowScreenShareDropdown(false)
      
      const screenTrack = newScreenStream.getVideoTracks()[0]
      
      // Add screen track to all peer connections and renegotiate sequentially
      const renegotiations = []
      peerConnections.current.forEach((pc, socketId) => {

        pc.addTrack(screenTrack, newScreenStream)
        
        // Queue renegotiation
        renegotiations.push(
          (async () => {
            try {
              const offer = await pc.createOffer()
              await pc.setLocalDescription(offer)
              socket?.emit('offer', { target: socketId, offer })

            } catch (error) {
              console.error('[ScreenShare] Failed to renegotiate with:', socketId, error)
            }
          })()
        )
      })
      
      // Wait for all renegotiations to complete
      await Promise.all(renegotiations)
      
      playScreenShareStart()
      socket?.emit('toggle-screen-share', { roomId, enabled: true })
      
      // Handle when user stops screen share via browser UI
      screenTrack.onended = () => {
        stopScreenShare()
      }
      
      toast.success('Screen sharing started')
    } catch (error) {
      console.error('[ScreenShare] Failed:', error)
      if (error.name === 'NotAllowedError') {
        toast.error('Screen sharing permission denied')
      } else if (error.name === 'NotSupportedError') {
        toast.error('Screen sharing is not supported on this browser')
      } else {
        toast.error('Screen sharing failed')
      }
    }
  }
  
  const stopScreenShare = async () => {



    // Use ref instead of state to avoid race conditions
    const streamToStop = screenStreamRef.current || screenStream
    
    if (streamToStop) {
      const tracks = streamToStop.getTracks()
      
      // Remove screen track from all peer connections

      peerConnections.current.forEach((pc, socketId) => {
        const senders = pc.getSenders()

        senders.forEach(sender => {
          if (sender.track && tracks.includes(sender.track)) {

            pc.removeTrack(sender)
          }
        })
      })
      
      // Renegotiate with all peers to notify them screen share stopped

      const renegotiations = []
      peerConnections.current.forEach((pc, socketId) => {
        renegotiations.push(
          (async () => {
            try {

              const offer = await pc.createOffer()
              await pc.setLocalDescription(offer)
              socket?.emit('offer', { target: socketId, offer })

            } catch (error) {
              console.error('[ScreenShare] Failed to renegotiate with:', socketId, error)
            }
          })()
        )
      })
      
      // Wait for all renegotiations to complete

      await Promise.all(renegotiations)

      // Stop tracks if not already stopped (handles both UI button and browser stop button)
      tracks.forEach(track => {
        if (track.readyState !== 'ended') {

          track.stop()
        } else {

        }
      })
      
      setScreenStream(null)
      screenStreamRef.current = null

    } else {
    }
    setScreenSharing(false)
    setShowScreenShareDropdown(false)
    playScreenShareStop()
    socket?.emit('toggle-screen-share', { roomId, enabled: false })

  }
  
  const toggleScreenShare = () => {
    if (screenSharing) {
      setShowScreenShareDropdown(!showScreenShareDropdown)
    } else {
      startScreenShare()
    }
  }

  const sendMessage = (text) => {
    const trimmed = (text ?? newMessage).trim()
    if (trimmed && socket) {
      socket.emit('send-message', {
        roomId,
        message: trimmed,
        userName
      })
      if (text === undefined) setNewMessage('')
    }
  }

  const sendFile = async (file) => {
    if (!file || !socket) return
    if (file.size > 15 * 1024 * 1024) {
      toast.error('File is too large (max 15MB)')
      return
    }
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post(`/api/rooms/${roomId}/files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      const { url, name, size } = response.data
      socket.emit('send-message', {
        roomId,
        message: name,
        userName,
        type: 'file',
        fileUrl: url,
        fileName: name,
        fileSize: size
      })
    } catch (error) {
      console.error('File upload failed:', error)
      toast.error(error.response?.data?.error || 'Failed to upload file. Its type may not be supported.')
    }
  }

  const returnToMainRoom = () => {
    if (!breakoutInfo) return
    try {
      sessionStorage.removeItem(`rumo_breakout_of_${roomId}`)
    } catch {
      // ignore - private browsing etc.
    }
    navigate(`/m/${breakoutInfo.mainRoomId}`, { state: { fromPreJoin: true } })
  }

  const copyInviteLink = () => {
    const inviteLink = `${window.location.origin}/room/${roomId}`
    navigator.clipboard.writeText(inviteLink).then(() => {
      toast.success('Invite link copied!')
    }).catch(() => {
      toast.error('Failed to copy link')
    })
  }

  const toggleHand = () => {
    if (!socket) return
    const next = !handRaised
    setHandRaised(next)
    socket.emit(next ? 'raise-hand' : 'lower-hand', { roomId })
  }

  const sendReaction = (emoji) => {
    if (!socket) return
    socket.emit('send-reaction', { roomId, emoji })
  }

  // Local recording: saves your own camera & mic to your device via
  // MediaRecorder. Rumo is peer-to-peer with no media server, so this is
  // "record my side of the call," not a server-side recording of everyone -
  // see docs/API.md and the README comparison table.
  const startRecording = () => {
    if (!localStreamRef.current) {
      toast.error('No camera/mic stream to record yet')
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      toast.error('Recording is not supported in this browser')
      return
    }

    try {
      recordedChunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm'
      const recorder = new MediaRecorder(localStreamRef.current, { mimeType })

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `rumo-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(link.href)
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      playRecordingStart()
      toast.success('Recording your camera & mic - saved to your device when you stop')
    } catch (error) {
      console.error('Failed to start recording:', error)
      toast.error('Could not start recording')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current = null
    setIsRecording(false)
    playRecordingStop()
    toast.success('Recording saved to your downloads')
  }

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const handleApproveJoin = (targetSocketId) => {
    if (socket) {
      socket.emit('approve-join', { targetSocketId })
      // Remove from pending requests
      setJoinRequests(prev => prev.filter(req => req.socketId !== targetSocketId))
      toast.success('Participant approved')
    }
  }

  const handleRejectJoin = (targetSocketId) => {
    if (socket) {
      socket.emit('reject-join', { targetSocketId })
      // Remove from pending requests
      setJoinRequests(prev => prev.filter(req => req.socketId !== targetSocketId))
      toast('Join request declined')
    }
  }

  // Single source of truth for releasing the camera/mic (and everything
  // downstream of them: screen share, background-blur/noise-suppression
  // processors, the recorder). Every exit path - the Leave button, an
  // unmount for any reason, a hard tab close, and getting kicked/removed/
  // disconnected - funnels through this so the browser's camera/mic
  // indicator reliably goes dark instead of depending on whichever cleanup
  // path happened to run. Function declaration (not a const) so it's
  // hoisted and callable from the socket handlers registered earlier in
  // this component, which only ever close over stable refs here anyway.
  function stopAllMedia({ closePeers = false } = {}) {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }

    if (localStreamRef.current) {
      addDebugLog(`Stopping ${localStreamRef.current.getTracks().length} local tracks`, 'info')
      localStreamRef.current.getTracks().forEach(track => {
        addDebugLog(`Stopping track: ${track.kind} (${track.label})`, 'info')
        track.stop()
      })
      localStreamRef.current = null
      setLocalStream(null)
    }

    if (screenStreamRef.current) {
      addDebugLog('Stopping screen share', 'info')
      screenStreamRef.current.getTracks().forEach(track => track.stop())
      screenStreamRef.current = null
      setScreenStream(null)
      setScreenSharing(false)
    }

    if (originalVideoTrackRef.current) {
      originalVideoTrackRef.current.stop()
      originalVideoTrackRef.current = null
    }

    if (originalAudioTrackRef.current) {
      originalAudioTrackRef.current.stop()
      originalAudioTrackRef.current = null
    }

    if (blurProcessorRef.current) {
      blurProcessorRef.current.stop()
      blurProcessorRef.current = null
    }

    if (noiseSuppressorRef.current) {
      noiseSuppressorRef.current.dispose()
      noiseSuppressorRef.current = null
    }

    if (closePeers && peerConnections.current.size > 0) {
      peerConnections.current.forEach(pc => pc.close())
      peerConnections.current.clear()
    }
  }

  const leaveMeeting = () => {
    addDebugLog('Leaving meeting - starting cleanup...', 'info')

    stopAllMedia({ closePeers: true })

    // Reset background blur/image settings - neither should carry into the next meeting
    if (settings.backgroundBlur) {
      updateSetting('backgroundBlur', false)
    }
    if (settings.backgroundImage) {
      updateSetting('backgroundImage', null)
    }

    // Release wake lock
    if (wakeLock) {
      wakeLock.release()
      setWakeLock(null)
    }
    
    // Disconnect socket
    if (socket) {
      addDebugLog('Disconnecting socket', 'info')
      socket.disconnect()
    }
    
    addDebugLog('✅ Cleanup completed', 'success')
    playUserLeft()
    postToParent('readyToClose', {})
    if (!isEmbedded) {
      setTimeout(() => navigate('/'), 300)
    }
  }

  // Embed control API: a parent page (see docs/EMBEDDING.md) can drive basic
  // actions via postMessage without building its own call UI. Re-subscribes
  // every render so it always calls the latest versions of these handlers -
  // cheap, since it's a no-op outside embed mode.
  useEffect(() => {
    if (!isEmbedded) return

    const handleParentMessage = (event) => {
      if (event.source !== window.parent) return
      const data = event.data
      if (!data || data.source !== 'rumo' || data.type !== 'execute') return

      switch (data.command) {
        case 'toggleAudio':
          toggleAudio()
          break
        case 'toggleVideo':
          toggleVideo()
          break
        case 'toggleScreenShare':
          toggleScreenShare()
          break
        case 'raiseHand':
          if (!handRaised) toggleHand()
          break
        case 'lowerHand':
          if (handRaised) toggleHand()
          break
        case 'sendReaction':
          if (data.args?.[0]) sendReaction(data.args[0])
          break
        case 'startRecording':
          if (!isRecording) startRecording()
          break
        case 'stopRecording':
          if (isRecording) stopRecording()
          break
        case 'hangup':
          leaveMeeting()
          break
        default:
          break
      }
    }

    window.addEventListener('message', handleParentMessage)
    return () => window.removeEventListener('message', handleParentMessage)
  })

  // Handle responsive design
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      setSidebarOpen(!mobile)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Auto-hide controls
  useEffect(() => {
    if (isMobile || !settings.autoHideControls) return
    
    const resetControlsTimeout = () => {
      setShowControls(true)
      clearTimeout(controlsTimeoutRef.current)
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000)
    }

    const handleMouseMove = () => resetControlsTimeout()
    document.addEventListener('mousemove', handleMouseMove)
    resetControlsTimeout()

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      clearTimeout(controlsTimeoutRef.current)
    }
  }, [isMobile, settings.autoHideControls])
  
  // Cleanup on browser tab close/refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Not preventing default - just releasing the camera/mic before the
      // page actually goes away.
      stopAllMedia({ closePeers: true })
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  // Monitor screen stream validity (especially after hot reload)
  useEffect(() => {
    if (!screenStream) return
    
    const checkStreamValidity = () => {
      const tracks = screenStream.getTracks()
      const hasActiveTracks = tracks.some(track => track.readyState === 'live')
      
      if (!hasActiveTracks) {

        setScreenStream(null)
        screenStreamRef.current = null
        setScreenSharing(false)
        socket?.emit('toggle-screen-share', { roomId, enabled: false })
        toast.info('Screen sharing ended')
      }
    }
    
    // Check immediately
    checkStreamValidity()
    
    // Also listen for track ended events
    screenStream.getTracks().forEach(track => {
      if (!track.onended) {
        track.onended = () => {

          stopScreenShare()
        }
      }
    })
  }, [screenStream, socket, roomId])

  // Periodically clean up remote screen shares with ended tracks
  useEffect(() => {
    const interval = setInterval(() => {
      setRemoteScreenStreams(prev => {
        const newMap = new Map(prev)
        let hasChanges = false
        
        Array.from(newMap.entries()).forEach(([key, stream]) => {
          const tracks = stream.getTracks()
          const allEnded = tracks.length === 0 || tracks.every(track => track.readyState === 'ended')
          
          if (allEnded) {

            newMap.delete(key)
            hasChanges = true
          }
        })
        
        return hasChanges ? newMap : prev
      })
    }, 500) // Check every 500ms for faster cleanup
    
    return () => clearInterval(interval)
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showScreenShareDropdown && !event.target.closest('.screen-share-container')) {
        setShowScreenShareDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showScreenShareDropdown])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showLayoutMenu && !event.target.closest('.layout-menu-container')) {
        setShowLayoutMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showLayoutMenu])

  // Handle video quality changes
  useEffect(() => {
    const updateVideoQuality = async () => {
      if (!localStreamRef.current) return
      
      try {
        // Get new constraints with updated quality
        const constraints = getConstraints({ 
          video: true, 
          audio: true,
          facingMode 
        })
        
        // Get new media stream with updated quality
        const newStream = await navigator.mediaDevices.getUserMedia(constraints)
        const newVideoTrack = newStream.getVideoTracks()[0]
        const oldVideoTrack = localStreamRef.current.getVideoTracks()[0]
        
        if (!newVideoTrack) return
        
        // Store the new original track
        if (originalVideoTrackRef.current) {
          originalVideoTrackRef.current.stop()
        }
        originalVideoTrackRef.current = newVideoTrack.clone()
        
        // Apply blur/replacement if enabled
        let finalVideoTrack = newVideoTrack
        if (settings.backgroundBlur || settings.backgroundImage) {
          try {
            const videoElement = document.createElement('video')
            videoElement.srcObject = new MediaStream([newVideoTrack])
            videoElement.autoplay = true
            videoElement.muted = true
            await videoElement.play()

            // Use existing processor or create new one with person detection
            if (!blurProcessorRef.current) {
              try {
                blurProcessorRef.current = new BackgroundBlurProcessor(15, settings.backgroundImage)
                await blurProcessorRef.current.init()
              } catch (mlError) {
                console.warn('ML-based blur failed, using simple blur')
                blurProcessorRef.current = new SimpleBackgroundBlurProcessor(15, settings.backgroundImage)
              }
            }
            
            const blurredStream = await blurProcessorRef.current.start(videoElement)
            finalVideoTrack = blurredStream.getVideoTracks()[0]
            newVideoTrack.stop() // Stop the original since we're using blurred
          } catch (blurError) {
            console.error('Blur application failed during quality change:', blurError)
          }
        }
        
        // Replace video track in local stream
        localStreamRef.current.removeTrack(oldVideoTrack)
        localStreamRef.current.addTrack(finalVideoTrack)
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
        
        // Replace video track in all peer connections
        peerConnections.current.forEach(async (pc) => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video')
          if (sender) {
            await sender.replaceTrack(finalVideoTrack)
          }
        })
        
        // Stop old video track
        if (oldVideoTrack) {
          oldVideoTrack.stop()
        }
        
        // Stop other new tracks we don't need
        newStream.getAudioTracks().forEach(track => track.stop())
        
        toast.success(`Video quality updated to ${settings.videoQuality}`)
      } catch (error) {
        console.error('Failed to update video quality:', error)
        toast.error('Failed to update video quality')
      }
    }
    
    // Only update if we have an active stream
    if (localStreamRef.current) {
      updateVideoQuality()
    }
  }, [settings.videoQuality])

  // Handle audio quality changes
  useEffect(() => {
    const updateAudioQuality = async () => {
      if (!localStreamRef.current) return
      
      const currentAudioTrack = localStreamRef.current.getAudioTracks()[0]
      if (!currentAudioTrack) return
      
      try {
        // Get new constraints with updated audio quality
        const constraints = getConstraints({ 
          video: false,
          audio: true
        })
        
        // Get new audio stream with updated quality
        const newStream = await navigator.mediaDevices.getUserMedia(constraints)
        const newAudioTrack = newStream.getAudioTracks()[0]
        
        if (!newAudioTrack) return
        
        // Replace audio track in local stream
        localStreamRef.current.removeTrack(currentAudioTrack)
        localStreamRef.current.addTrack(newAudioTrack)
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
        
        // Replace audio track in all peer connections
        peerConnections.current.forEach(async (pc) => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'audio')
          if (sender) {
            await sender.replaceTrack(newAudioTrack)
          }
        })
        
        // Stop old audio track
        currentAudioTrack.stop()
        
        toast.success(`Audio quality updated to ${settings.audioQuality}`)
      } catch (error) {
        console.error('Failed to update audio quality:', error)
        toast.error('Failed to update audio quality')
      }
    }
    
    // Only update if we have an active stream
    if (localStreamRef.current) {
      updateAudioQuality()
    }
  }, [settings.audioQuality])

  // Handle background blur toggle
  useEffect(() => {
    const toggleBlur = async () => {
      if (!localStreamRef.current) return
      
      const currentVideoTrack = localStreamRef.current.getVideoTracks()[0]
      if (!currentVideoTrack) return
      
      try {
        if (settings.backgroundBlur || settings.backgroundImage) {
          // If a processor already exists but for a different background
          // image (or for blur when an image is now wanted, or vice versa),
          // tear it down first so it gets recreated below with the new one.
          if (blurProcessorRef.current && blurProcessorRef.current.backgroundImageUrl !== (settings.backgroundImage || null)) {
            try {
              blurProcessorRef.current.stop()
            } catch (e) {
              console.error('Error stopping blur processor:', e)
            }
            blurProcessorRef.current = null
          }

          // Enable blur/replacement
          const videoElement = document.createElement('video')
          videoElement.srcObject = new MediaStream([originalVideoTrackRef.current || currentVideoTrack])
          videoElement.autoplay = true
          videoElement.muted = true
          await videoElement.play()
          
          // Try BackgroundBlurProcessor first (with person segmentation)
          try {
            if (!blurProcessorRef.current) {
              blurProcessorRef.current = new BackgroundBlurProcessor(15, settings.backgroundImage)
              await blurProcessorRef.current.init()
              toast.success(settings.backgroundImage ? 'Virtual background enabled' : 'Background blur enabled')
            }
          } catch (mlError) {
            console.warn('ML-based blur failed, using simple blur:', mlError)
            // Fall back to simple blur
            if (blurProcessorRef.current) {
              try {
                blurProcessorRef.current.stop()
              } catch (e) {
                console.error('Error stopping blur processor:', e)
              }
            }
            blurProcessorRef.current = new SimpleBackgroundBlurProcessor(15, settings.backgroundImage)
            toast.success(settings.backgroundImage ? 'Virtual background enabled (simple mode)' : 'Background blur enabled (simple mode)')
          }
          
          const blurredStream = await blurProcessorRef.current.start(videoElement)
          const blurredVideoTrack = blurredStream.getVideoTracks()[0]
          
          if (!blurredVideoTrack) {
            throw new Error('Failed to get blurred video track')
          }
          
          // Replace track in local stream
          localStreamRef.current.removeTrack(currentVideoTrack)
          localStreamRef.current.addTrack(blurredVideoTrack)
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
          
          // Replace track in all peer connections
          peerConnections.current.forEach(async (pc) => {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video')
            if (sender) {
              await sender.replaceTrack(blurredVideoTrack)
            }
          })
          
          // Stop the current track if it's not the original
          if (currentVideoTrack !== originalVideoTrackRef.current) {
            currentVideoTrack.stop()
          }
        } else {
          // Disable blur
          if (blurProcessorRef.current) {
            try {
              blurProcessorRef.current.stop()
              blurProcessorRef.current = null
            } catch (e) {
              console.error('Error stopping blur processor:', e)
            }
          }
          
          // Use original track or get new one
          let originalTrack = originalVideoTrackRef.current
          if (!originalTrack || originalTrack.readyState === 'ended') {
            const constraints = getConstraints({ 
              video: true, 
              audio: false,
              facingMode 
            })
            const stream = await navigator.mediaDevices.getUserMedia(constraints)
            originalTrack = stream.getVideoTracks()[0]
            originalVideoTrackRef.current = originalTrack.clone()
          }
          
          // Replace track in local stream
          localStreamRef.current.removeTrack(currentVideoTrack)
          localStreamRef.current.addTrack(originalTrack)
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
          
          // Replace track in all peer connections
          peerConnections.current.forEach(async (pc) => {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video')
            if (sender) {
              await sender.replaceTrack(originalTrack)
            }
          })
          
          // Stop the blurred track
          currentVideoTrack.stop()

          toast.success('Background effect disabled')
        }
      } catch (error) {
        console.error('Failed to toggle background blur:', error)
        toast.error('Background effect failed, disabling...')

        // Auto-disable on error to prevent being stuck with a broken track
        if (settings.backgroundBlur) {
          updateSetting('backgroundBlur', false)
        }
        if (settings.backgroundImage) {
          updateSetting('backgroundImage', null)
        }

        // Clean up processor
        if (blurProcessorRef.current) {
          try {
            blurProcessorRef.current.stop()
          } catch (e) {
            console.error('Error cleaning up blur processor:', e)
          }
          blurProcessorRef.current = null
        }
      }
    }
    
    // Only toggle if we have an active stream
    if (localStreamRef.current) {
      toggleBlur()
    }
  }, [settings.backgroundBlur, settings.backgroundImage])

  // Background functionality - Page Visibility API with audio maintenance
  useEffect(() => {
    let audioContext = null
    let heartbeatInterval = null
    
    const handleVisibilityChange = () => {
      const visible = !document.hidden
      setIsPageVisible(visible)
      
      if (visible) {
        addDebugLog('📱 Page became visible - meeting continues', 'success')
        // Clean up background audio maintenance
        if (audioContext) {
          audioContext.close()
          audioContext = null
        }
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval)
          heartbeatInterval = null
        }
        requestWakeLock()
      } else {
        addDebugLog('📱 Page hidden - maintaining audio in background', 'info')
        // Show user notification about background audio
        if (audioEnabled) {
          toast('Audio will continue in background', {
            icon: '🔊',
            duration: 3000,
            style: {
              background: settings.theme === 'light' ? '#f3f4f6' : '#374151',
              color: settings.theme === 'light' ? '#1f2937' : '#f9fafb'
            }
          })
        }
        // Maintain audio context to prevent throttling
        maintainBackgroundAudio()
      }
    }
    
    const maintainBackgroundAudio = async () => {
      try {
        // Create AudioContext to keep audio processing active
        audioContext = new (window.AudioContext || window.webkitAudioContext)()
        
        // Resume context if suspended (required by some browsers)
        if (audioContext.state === 'suspended') {
          await audioContext.resume()
        }
        
        // Create a silent oscillator to keep context active
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()
        
        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)
        gainNode.gain.value = 0 // Silent
        
        oscillator.frequency.value = 440
        oscillator.start()
        
        // Heartbeat to maintain WebRTC connections and audio
        heartbeatInterval = setInterval(() => {
          if (localStreamRef.current && audioEnabled) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0]
            if (audioTrack && audioTrack.readyState === 'live') {
              // Refresh audio track properties to prevent throttling
              audioTrack.enabled = false
              setTimeout(() => {
                if (audioTrack.readyState === 'live') {
                  audioTrack.enabled = true
                }
              }, 50)
            }
          }
          
          // Keep peer connections alive with stats check
          peerConnections.current.forEach(async (pc, socketId) => {
            if (pc.connectionState === 'connected') {
              try {
                // Get stats to keep connection active
                await pc.getStats()
                
                // Ensure audio senders are active
                const audioSender = pc.getSenders().find(s => s.track?.kind === 'audio')
                if (audioSender && audioSender.track) {
                  // Touch the sender to keep it active
                  const params = audioSender.getParameters()
                  if (params) {
                    audioSender.setParameters(params)
                  }
                }
              } catch (error) {
                addDebugLog(`Heartbeat failed for peer ${socketId.substring(0, 8)}: ${error.message}`, 'warning')
              }
            }
          })
        }, 2000)
        
        addDebugLog('🔊 Background audio maintenance active', 'success')
        
        // Notify user that background audio is working
        setTimeout(() => {
          if (!document.hidden && audioEnabled) {
            toast.success('Background audio maintained successfully', {
              duration: 2000,
              style: {
                background: settings.theme === 'light' ? '#f0fdf4' : '#064e3b',
                color: settings.theme === 'light' ? '#166534' : '#bbf7d0'
              }
            })
          }
        }, 3000)
      } catch (error) {
        addDebugLog(`Background audio setup failed: ${error.message}`, 'warning')
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (audioContext) {
        audioContext.close()
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
      }
    }
  }, [])
  
  // Wake Lock API to prevent device sleep
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        const lock = await navigator.wakeLock.request('screen')
        setWakeLock(lock)
        addDebugLog('🔒 Wake lock acquired - screen will stay on', 'success')
        
        lock.addEventListener('release', () => {
          addDebugLog('🔓 Wake lock released', 'info')
          setWakeLock(null)
        })
      }
    } catch (error) {
      addDebugLog(`Wake lock failed: ${error.message}`, 'warning')
    }
  }
  
  // Optimize for background mode - keep audio, reduce video
  const optimizeForBackground = () => {
    if (!localStream) return
    
    // Keep audio active but reduce video quality to save bandwidth
    const audioTrack = localStream.getAudioTracks()[0]
    const videoTrack = localStream.getVideoTracks()[0]
    
    // Ensure audio stays enabled and active in background
    if (audioTrack && audioEnabled) {
      audioTrack.enabled = true
      // Force audio track to stay active
      if (audioTrack.readyState === 'live') {
        // Apply constraints to refresh the track
        audioTrack.applyConstraints({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }).catch(() => {
          // Ignore constraint errors, just keep track active
        })
      }
      addDebugLog('🔊 Audio maintained and refreshed in background', 'success')
    }
    
    // Optionally disable video to save bandwidth
    if (videoTrack && videoEnabled && settings.backgroundOptimization) {
      videoTrack.enabled = false
      addDebugLog('📹 Video disabled for background optimization', 'info')
      
      // Re-enable when page becomes visible
      const enableVideoWhenVisible = () => {
        if (!document.hidden && videoEnabled) {
          videoTrack.enabled = true
          addDebugLog('📹 Video re-enabled - page is visible', 'success')
          document.removeEventListener('visibilitychange', enableVideoWhenVisible)
        }
      }
      document.addEventListener('visibilitychange', enableVideoWhenVisible)
    }
  }
  
  // Initialize wake lock on mount
  useEffect(() => {
    requestWakeLock()
    
    return () => {
      if (wakeLock) {
        wakeLock.release()
      }
    }
  }, [])
  
  // Handle noise suppression toggle
  useEffect(() => {
    // Skip on initial mount
    if (isInitialNoiseSuppressionMount.current) {
      isInitialNoiseSuppressionMount.current = false
      return
    }

    const updateNoiseSuppression = async () => {
      if (!localStreamRef.current) return
      
      const currentAudioTrack = localStreamRef.current.getAudioTracks()[0]
      if (!currentAudioTrack) return
      
      try {
        console.log(`🔄 Updating noise suppression: ${settings.noiseSuppression}`)
        
        if (settings.noiseSuppression) {
          // Enable noise gate
          // Dispose old processor if exists
          if (noiseSuppressorRef.current) {
            noiseSuppressorRef.current.dispose()
            noiseSuppressorRef.current = null
          }
          
          // Get original audio track or current one
          const sourceTrack = originalAudioTrackRef.current || currentAudioTrack
          
          // Apply noise gate
          const { stream: processedStream, processor } = await createNoiseSuppressor(
            new MediaStream([sourceTrack]),
            true // Use advanced noise gate
          )
          
          const processedAudioTrack = processedStream.getAudioTracks()[0]
          if (processedAudioTrack) {
            // Replace audio track in local stream
            localStreamRef.current.removeTrack(currentAudioTrack)
            localStreamRef.current.addTrack(processedAudioTrack)
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
            
            // Replace audio track in all peer connections
            for (const pc of peerConnections.current.values()) {
              const sender = pc.getSenders().find(s => s.track?.kind === 'audio')
              if (sender) {
                await sender.replaceTrack(processedAudioTrack)
              }
            }
            
            // Store processor
            noiseSuppressorRef.current = processor
            
            // Stop old audio track if it's not the original
            if (currentAudioTrack !== sourceTrack) {
              currentAudioTrack.stop()
            }
            
            toast.success('Advanced noise suppression enabled')
            console.log('✅ Advanced noise gate applied')
          }
        } else {
          // Disable noise gate - use original track
          if (noiseSuppressorRef.current) {
            noiseSuppressorRef.current.dispose()
            noiseSuppressorRef.current = null
          }
          
          // Use original audio track
          const originalTrack = originalAudioTrackRef.current
          if (originalTrack) {
            // Replace with original
            localStreamRef.current.removeTrack(currentAudioTrack)
            localStreamRef.current.addTrack(originalTrack)
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
            
            // Replace in all peer connections
            for (const pc of peerConnections.current.values()) {
              const sender = pc.getSenders().find(s => s.track?.kind === 'audio')
              if (sender) {
                await sender.replaceTrack(originalTrack)
              }
            }
            
            // Stop processed track
            currentAudioTrack.stop()
            
            toast.success('Noise suppression disabled')
            console.log('ℹ️ Using original audio track (browser built-in only)')
          }
        }
      } catch (error) {
        console.error('Failed to update noise suppression:', error)
        toast.error('Failed to update noise suppression')
      }
    }
    
    // Only update if we have an active stream
    if (localStreamRef.current && localStreamRef.current.getAudioTracks().length > 0) {
      updateNoiseSuppression()
    }
  }, [settings.noiseSuppression])

  // Theme classes - light theme with warm tones, dark theme truly dark
  const themeClasses = settings.theme === 'light' 
    ? 'bg-gray-50'
    : 'bg-gray-950'

  const headerClasses = settings.theme === 'light'
    ? isMobile
      ? 'bg-white/95 border-b border-gray-200 shadow-lg'
      : 'bg-white/90'
    : isMobile
      ? 'bg-gray-950/98 border-b border-gray-800/50 shadow-lg'
      : 'bg-gray-950/90'

  const roomInfoClasses = settings.theme === 'light'
    ? 'bg-white/90 border-gray-200 shadow-xl'
    : 'bg-gray-900/90 border-gray-800/50 shadow-xl'

  const buttonClasses = settings.theme === 'light'
    ? 'text-gray-700 hover:bg-gray-200/60'
    : 'text-white hover:bg-gray-800/50'

  const textClasses = settings.theme === 'light'
    ? 'text-gray-900'
    : 'text-white'

  const secondaryTextClasses = settings.theme === 'light'
    ? 'text-gray-600'
    : 'text-gray-400'

  return (
    <div className={`h-screen ${themeClasses} flex flex-col overflow-hidden`}>
      {/* Header */}
      <div className={`${isMobile ? 'sticky top-0' : 'absolute top-0 left-0 right-0'} z-50 ${headerClasses} ${isMobile ? 'px-3 py-2.5' : 'px-4 py-3'} transition-opacity duration-300 ${!isMobile && !showControls ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <img
              src={branding.logoIcon}
              alt={branding.appName}
              className={`${isMobile ? 'h-6' : 'h-8'} object-contain`}
            />
            {!isMobile && <span className={`font-bold ${textClasses}`}>{branding.appName}</span>}
          </div>
          
          <div className="flex items-center space-x-2 md:space-x-3">
            <div className={`${roomInfoClasses} rounded-xl md:rounded-2xl ${isMobile ? 'px-2.5 py-1.5' : 'px-4 py-2'} border`}>
              <div className="flex items-center gap-2 md:gap-3">
                <div className={`${isMobile ? 'w-2 h-2' : 'w-3 h-3'} bg-green-500 rounded-full animate-pulse`} />
                <span className={`${textClasses} font-medium ${isMobile ? 'text-xs' : 'text-sm'}`}>
                  {isMobile ? `${participants.length + 1}` : `Room: ${roomId}`}
                </span>
                {!isMobile && (
                  <>
                    <span className={`${secondaryTextClasses} text-xs`}>•</span>
                    <span className={`${secondaryTextClasses} text-xs`}>{participants.length + 1} {participants.length === 0 ? 'participant' : 'participants'}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-1.5 md:space-x-2">
            {branding.features.layoutSwitch !== false && (() => {
              const currentLayout = LAYOUT_OPTIONS.find(o => o.id === viewMode) || LAYOUT_OPTIONS[0]
              const CurrentLayoutIcon = currentLayout.icon
              return (
                <div className="relative layout-menu-container">
                  <button
                    onClick={() => setShowLayoutMenu(v => !v)}
                    className={`${isMobile ? 'p-2' : 'p-3'} ${buttonClasses} rounded-xl transition-all duration-200 hover:scale-105 shadow-lg`}
                    title="Change layout"
                  >
                    <CurrentLayoutIcon size={isMobile ? 16 : 18} />
                  </button>

                  {showLayoutMenu && (
                    <div className="absolute top-full mt-2 right-0 bg-gray-800/95 backdrop-blur-xl border border-gray-600/50 rounded-xl shadow-2xl py-2 min-w-[180px] max-w-[calc(100vw-2rem)] z-50">
                      {LAYOUT_OPTIONS.map((option) => {
                        const Icon = option.icon
                        const isActive = viewMode === option.id
                        return (
                          <button
                            key={option.id}
                            onClick={() => {
                              setViewMode(option.id)
                              updateSetting('layout', option.id)
                              setShowLayoutMenu(false)
                            }}
                            className={`w-full px-4 py-2.5 text-left flex items-center gap-3 text-sm transition-colors ${
                              isActive ? 'text-blue-400 font-semibold bg-blue-500/10' : 'text-gray-200 hover:bg-gray-700/50'
                            }`}
                          >
                            <Icon size={16} />
                            {option.label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Sidebar toggle - collapses the panel on any screen size */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`${isMobile ? 'p-2' : 'p-3'} ${buttonClasses} rounded-xl transition-all duration-200 hover:scale-105 shadow-lg relative`}
              title={sidebarOpen ? 'Hide panel' : 'Show panel'}
            >
              {sidebarOpen ? <X size={isMobile ? 16 : 18} /> : <Users size={isMobile ? 16 : 18} />}
              {messages.length > 0 && activeTab !== 'chat' && !sidebarOpen && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-[8px] font-bold">{messages.length > 9 ? '9+' : messages.length}</span>
                </div>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Video Area */}
        <div className={`flex-1 relative ${isMobile ? '' : 'pb-[100px]'}`}>
          <VideoGrid
            localStream={localStream}
            localStreamVersion={localStreamVersion}
            screenStream={screenStream}
            remoteStreams={remoteStreams}
            remoteStreamVersions={remoteStreamVersions}
            remoteScreenStreams={remoteScreenStreams}
            participants={participants}
            userName={userName}
            userProfilePicture={null}
            audioEnabled={audioEnabled}
            videoEnabled={videoEnabled}
            screenSharing={screenSharing}
            viewMode={viewMode}
            isHost={isHost}
            userRole={userRole}
            settings={settings}
            isMobile={isMobile}
            setViewMode={setViewMode}
            setPinnedVideo={setPinnedVideo}
            pinnedVideo={pinnedVideo}
          />

          {settings.liveCaptions && captions.length > 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 max-w-2xl w-[90%] space-y-1 pointer-events-none">
              {captions.map((c) => (
                <div key={c.id} className="bg-black/70 text-white text-sm sm:text-base px-4 py-2 rounded-lg text-center">
                  <span className="font-semibold">{c.userName}: </span>{c.text}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <MeetingSidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          participants={participants}
          userName={userName}
          userProfilePicture={null}
          isHost={isHost}
          userRole={userRole}
          audioEnabled={audioEnabled}
          videoEnabled={videoEnabled}
          messages={messages}
          newMessage={newMessage}
          setNewMessage={setNewMessage}
          sendMessage={sendMessage}
          sendFile={sendFile}
          isMobile={isMobile}
          settings={settings}
          socket={socket}
          roomId={roomId}
        />
      </div>

      {/* Bottom Controls */}
      <div className={`${isMobile ? 'sticky bottom-0 left-0 right-0 z-50 backdrop-blur-xl border-t pb-safe' : ''} ${
        settings.theme === 'light' 
          ? isMobile ? 'bg-white/98 border-gray-200' : ''
          : isMobile ? 'bg-gray-950/98 border-gray-800/50' : ''
      }`}>
        <MeetingControls
          audioEnabled={audioEnabled}
          videoEnabled={videoEnabled}
          screenSharing={screenSharing}
          showScreenShareDropdown={showScreenShareDropdown}
          showControls={showControls}
          toggleAudio={toggleAudio}
          toggleVideo={toggleVideo}
          canScreenShare={isHost || userRole === 'co-host' || allowParticipantScreenShare}
          toggleScreenShare={toggleScreenShare}
          stopScreenShare={stopScreenShare}
          copyInviteLink={copyInviteLink}
          setSettingsOpen={setSettingsOpen}
          leaveMeeting={leaveMeeting}
          handRaised={handRaised}
          onToggleHand={toggleHand}
          onSendReaction={sendReaction}
          isRecording={isRecording}
          onToggleRecording={toggleRecording}
          onToggleWhiteboard={() => setShowWhiteboard(v => !v)}
          isMobile={isMobile}
          settings={settings}
        />
      </div>

      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        updateSetting={updateSetting}
        resetSettings={resetSettings}
      />

      {branding.features.whiteboard && (
        <Whiteboard
          isOpen={showWhiteboard}
          onClose={() => setShowWhiteboard(false)}
          socket={socket}
          roomId={roomId}
          canClear={isHost}
        />
      )}

      <ReactionOverlay reactions={floatingReactions} />

      {/* Breakout room banner */}
      {breakoutInfo && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[90] bg-blue-600/95 backdrop-blur-sm text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-3">
          <span className="text-sm font-medium">You're in {breakoutInfo.breakoutTitle}</span>
          <button
            onClick={returnToMainRoom}
            className="text-sm font-semibold underline hover:no-underline"
          >
            Return to main room
          </button>
        </div>
      )}

      {/* Join Request Popups */}
      {joinRequests.map((request, index) => (
        <div key={request.socketId} style={{ top: `${80 + (index * 140)}px` }}>
          <JoinRequestPopup
            request={request}
            onApprove={handleApproveJoin}
            onReject={handleRejectJoin}
            settings={settings}
          />
        </div>
      ))}

      {/* Waiting for approval screen overlay */}
      {isWaiting && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className={`max-w-md mx-4 p-8 rounded-2xl text-center ${
            settings.theme === 'light' ? 'bg-white' : 'bg-gray-800'
          }`}>
            <div className="mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/20 flex items-center justify-center">
                <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <h3 className={`text-xl font-semibold mb-2 ${settings.theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                Waiting for Host Approval
              </h3>
              <p className={`${settings.theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                This is a private meeting. The host will review your request shortly.
              </p>
            </div>
            <button
              onClick={() => navigate('/')}
              className={`px-6 py-2 rounded-lg ${
                settings.theme === 'light'
                  ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
              }`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default MeetingPro

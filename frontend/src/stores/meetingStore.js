import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

const useMeetingStore = create(
  subscribeWithSelector((set, get) => ({
    // Room State
    roomId: null,
    roomTitle: '',
    isHost: false,
    hostId: null,
    
    // User State
    userId: null,
    userName: '',
    userEmail: '',
    
    // Media State
    localStream: null,
    audioEnabled: true,
    videoEnabled: true,
    screenSharing: false,
    
    // Participants
    participants: [],
    remoteStreams: new Map(),
    
    // Chat
    messages: [],
    unreadCount: 0,
    
    // UI State
    sidebarOpen: true,
    chatOpen: true,
    participantsOpen: false,
    settingsOpen: false,
    
    // Connection State
    connected: false,
    reconnecting: false,
    connectionQuality: {},
    networkStats: {},
    
    // Errors
    errors: [],
    
    // Actions
    setRoomInfo: (roomId, roomTitle, isHost, hostId) => 
      set({ roomId, roomTitle, isHost, hostId }),
    
    setUserInfo: (userId, userName, userEmail) => 
      set({ userId, userName, userEmail }),
    
    setLocalStream: (stream) => 
      set({ localStream: stream }),
    
    toggleAudio: () => 
      set((state) => ({ audioEnabled: !state.audioEnabled })),
    
    toggleVideo: () => 
      set((state) => ({ videoEnabled: !state.videoEnabled })),
    
    setScreenSharing: (sharing) => 
      set({ screenSharing: sharing }),
    
    setParticipants: (participants) => 
      set({ participants }),
    
    addParticipant: (participant) => 
      set((state) => ({ 
        participants: [...state.participants, participant] 
      })),
    
    removeParticipant: (participantId) => 
      set((state) => ({ 
        participants: state.participants.filter(p => p.id !== participantId) 
      })),
    
    updateParticipant: (participantId, updates) => 
      set((state) => ({
        participants: state.participants.map(p => 
          p.id === participantId ? { ...p, ...updates } : p
        )
      })),
    
    setRemoteStream: (participantId, stream) => 
      set((state) => {
        const newStreams = new Map(state.remoteStreams);
        newStreams.set(participantId, stream);
        return { remoteStreams: newStreams };
      }),
    
    removeRemoteStream: (participantId) => 
      set((state) => {
        const newStreams = new Map(state.remoteStreams);
        newStreams.delete(participantId);
        return { remoteStreams: newStreams };
      }),
    
    addMessage: (message) => 
      set((state) => ({ 
        messages: [...state.messages, message],
        unreadCount: state.chatOpen ? state.unreadCount : state.unreadCount + 1
      })),
    
    clearUnreadCount: () => 
      set({ unreadCount: 0 }),
    
    toggleSidebar: () => 
      set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    
    toggleChat: () => 
      set((state) => ({ 
        chatOpen: !state.chatOpen,
        unreadCount: !state.chatOpen ? 0 : state.unreadCount
      })),
    
    toggleParticipants: () => 
      set((state) => ({ participantsOpen: !state.participantsOpen })),
    
    toggleSettings: () => 
      set((state) => ({ settingsOpen: !state.settingsOpen })),
    
    setConnected: (connected) => 
      set({ connected }),
    
    setReconnecting: (reconnecting) => 
      set({ reconnecting }),
    
    setConnectionQuality: (participantId, quality) => 
      set((state) => ({
        connectionQuality: {
          ...state.connectionQuality,
          [participantId]: quality
        }
      })),
    
    setNetworkStats: (participantId, stats) => 
      set((state) => ({
        networkStats: {
          ...state.networkStats,
          [participantId]: stats
        }
      })),
    
    addError: (error) => 
      set((state) => ({ 
        errors: [...state.errors.slice(-4), { 
          id: Date.now(), 
          message: error, 
          timestamp: new Date() 
        }] 
      })),
    
    removeError: (errorId) => 
      set((state) => ({ 
        errors: state.errors.filter(e => e.id !== errorId) 
      })),
    
    clearErrors: () => 
      set({ errors: [] }),
    
    // Reset store
    reset: () => 
      set({
        roomId: null,
        roomTitle: '',
        isHost: false,
        hostId: null,
        userId: null,
        userName: '',
        userEmail: '',
        localStream: null,
        audioEnabled: true,
        videoEnabled: true,
        screenSharing: false,
        participants: [],
        remoteStreams: new Map(),
        messages: [],
        unreadCount: 0,
        sidebarOpen: true,
        chatOpen: true,
        participantsOpen: false,
        settingsOpen: false,
        connected: false,
        reconnecting: false,
        connectionQuality: {},
        networkStats: {},
        errors: []
      }),
    
    // Computed values
    get totalParticipants() {
      return get().participants.length + 1; // +1 for current user
    },
    
    get isConnected() {
      return get().connected && !get().reconnecting;
    },
    
    get hasErrors() {
      return get().errors.length > 0;
    },
    
    get latestError() {
      const errors = get().errors;
      return errors.length > 0 ? errors[errors.length - 1] : null;
    }
  }))
);

export default useMeetingStore;
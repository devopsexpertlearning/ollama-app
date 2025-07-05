import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ChatSession, Message, OllamaModel, ModelProvider, ChatStats } from '@/types/chat';
import { StorageManager } from '@/utils/storage';
import { APIManager } from '@/utils/api';

interface ChatContextType {
  // Chat Sessions
  chatSessions: ChatSession[];
  currentSession: ChatSession | null;
  createNewChat: () => Promise<void>;
  switchToChat: (sessionId: string) => Promise<void>;
  deleteChat: (sessionId: string) => Promise<void>;
  deleteMultipleChats: (sessionIds: string[]) => Promise<void>;
  updateChatTitle: (sessionId: string, title: string) => Promise<void>;
  
  // Messages
  sendMessage: (text: string) => Promise<void>;
  regenerateResponse: (messageId: string) => Promise<void>;
  isLoading: boolean;
  
  // Models & Providers
  providers: ModelProvider[];
  activeModel: OllamaModel | null;
  setActiveModel: (model: OllamaModel) => Promise<void>;
  refreshProviders: () => Promise<void>;
  
  // Statistics
  stats: ChatStats;
  refreshStats: () => Promise<void>;
  
  // Connection status
  isConnected: boolean;
  connectionError: string | null;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [activeModel, setActiveModelState] = useState<OllamaModel | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [stats, setStats] = useState<ChatStats>({
    totalChats: 0,
    totalMessages: 0,
    totalTokens: 0,
    favoriteModel: '',
    averageResponseTime: 0,
    dailyUsage: [],
  });

  useEffect(() => {
    initializeData();
  }, []);

  const initializeData = async () => {
    try {
      // Always load chat sessions and stats first (these don't require API connection)
      await Promise.all([
        loadChatSessions(),
        loadActiveModel(),
        refreshStats(),
      ]);

      // Try to load providers, but don't fail if connection is unavailable
      try {
        await loadProviders();
        setIsConnected(true);
        setConnectionError(null);
      } catch (error) {
        console.warn('Failed to connect to AI provider during initialization:', error);
        setIsConnected(false);
        setConnectionError(error instanceof Error ? error.message : 'Connection failed');
        // Don't throw - allow app to continue without connection
      }
    } catch (error) {
      console.error('Failed to initialize local data:', error);
      // Only fail if we can't load local data
    }
  };

  const loadChatSessions = async () => {
    const sessions = await StorageManager.getChatSessions();
    // Ensure isActive is always boolean
    const normalizedSessions = sessions.map(s => ({
      ...s,
      isActive: s.isActive ?? false,
    }));
    setChatSessions(normalizedSessions);

    const activeSession = normalizedSessions.find(s => s.isActive) || normalizedSessions[0];
    if (activeSession) {
      setCurrentSession(activeSession);
    }
  };

  const loadProviders = async () => {
    const providersData = await APIManager.getProviders();
    setProviders(providersData);
  };

  const loadActiveModel = async () => {
    const model = await StorageManager.getActiveModel();
    setActiveModelState(model);
  };

  const createNewChat = async () => {
    if (!activeModel) {
      // If no active model, try to set the first available model
      if (providers.length > 0 && providers[0].models.length > 0) {
        await setActiveModel(providers[0].models[0]);
      } else {
        // No models available - this is expected if not connected
        throw new Error('No AI models available. Please configure your AI connection first.');
      }
    }

    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [],
      model: activeModel!.name,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      isPinned: false,
      tags: [],
    };

    // Ensure all sessions have isActive boolean
    const updatedSessions = chatSessions.map(s => ({
      ...s,
      isActive: false,
    }));
    updatedSessions.unshift(newSession);

    setChatSessions(updatedSessions);
    setCurrentSession(newSession);
    await StorageManager.saveChatSession(newSession);
  };

  const switchToChat = async (sessionId: string) => {
    // Ensure isActive is always boolean
    const updatedSessions = chatSessions.map(s => ({
      ...s,
      isActive: s.id === sessionId,
    }));

    setChatSessions(updatedSessions);
    const session = updatedSessions.find(s => s.id === sessionId);
    if (session) {
      setCurrentSession({ ...session, isActive: true });
    }

    await Promise.all(updatedSessions.map(s => StorageManager.saveChatSession(s)));
  };

  const deleteChat = async (sessionId: string) => {
    try {
      console.log('Deleting chat with ID:', sessionId);

      // Delete from storage first
      await StorageManager.deleteChatSession(sessionId);

      // Update local state
      const updatedSessions = chatSessions.filter(s => s.id !== sessionId);
      setChatSessions(updatedSessions);

      // If we deleted the current session, switch to another one or clear current session
      if (currentSession?.id === sessionId) {
        if (updatedSessions.length > 0) {
          // Switch to the first available session
          const newActiveSession = { ...updatedSessions[0], isActive: true };
          setCurrentSession(newActiveSession);

          // Update the active status in storage, ensure isActive is always boolean
          const sessionsToUpdate = updatedSessions.map(s => ({
            ...s,
            isActive: s.id === newActiveSession.id,
          }));
          setChatSessions(sessionsToUpdate);
          await Promise.all(sessionsToUpdate.map(s => StorageManager.saveChatSession(s)));
        } else {
          setCurrentSession(null);
        }
      }

      // Refresh stats after deletion
      await refreshStats();

      console.log('Chat deleted successfully');
    } catch (error) {
      console.error('Failed to delete chat:', error);
      throw error;
    }
  };

  const deleteMultipleChats = async (sessionIds: string[]) => {
    try {
      await StorageManager.deleteMultipleChatSessions(sessionIds);
      const updatedSessions = chatSessions.filter(s => !sessionIds.includes(s.id));
      setChatSessions(updatedSessions);

      if (currentSession && sessionIds.includes(currentSession.id)) {
        if (updatedSessions.length > 0) {
          await switchToChat(updatedSessions[0].id);
        } else {
          setCurrentSession(null);
        }
      }

      await refreshStats();
    } catch (error) {
      console.error('Failed to delete multiple chats:', error);
      throw error;
    }
  };

  const updateChatTitle = async (sessionId: string, title: string) => {
    const updatedSessions = chatSessions.map(s => 
      s.id === sessionId ? { ...s, title, updatedAt: new Date() } : s
    );
    setChatSessions(updatedSessions);
    
    if (currentSession?.id === sessionId) {
      setCurrentSession({ ...currentSession, title });
    }
    
    const session = updatedSessions.find(s => s.id === sessionId);
    if (session) {
      await StorageManager.saveChatSession(session);
    }
  };

  const sendMessage = async (text: string) => {
    if (!activeModel || !isConnected) {
      throw new Error('No AI connection available. Please configure your AI connection first.');
    }

    if (isLoading) return;

    // Create new chat if none exists
    if (!currentSession) {
      await createNewChat();
    }

    if (!currentSession) return;
    
    setIsLoading(true);
    
    try {
      const userMessage: Message = {
        id: Date.now().toString(),
        text,
        sender: 'user',
        timestamp: new Date(),
        model: activeModel!.name,
      };
      
      const updatedSession = {
        ...currentSession,
        messages: [...currentSession.messages, userMessage],
        updatedAt: new Date(),
        title: currentSession.messages.length === 0 ? generateChatTitle(text) : currentSession.title,
      };
      
      setCurrentSession(updatedSession);
      setChatSessions(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
      
      // Get response from API
      const response = await APIManager.sendMessage(text, activeModel!, currentSession.messages);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response,
        sender: 'assistant',
        timestamp: new Date(),
        model: activeModel!.name,
      };
      
      const finalSession = {
        ...updatedSession,
        messages: [...updatedSession.messages, assistantMessage],
        updatedAt: new Date(),
      };
      
      setCurrentSession(finalSession);
      setChatSessions(prev => prev.map(s => s.id === finalSession.id ? finalSession : s));
      
      await StorageManager.saveChatSession(finalSession);
      await refreshStats();
      
    } catch (error) {
      console.error('Failed to send message:', error);
      
      // Create a user-friendly error message
      let errorText = 'Failed to send message';
      if (error instanceof Error) {
        errorText = error.message;
      }
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: String(errorText),
        sender: 'assistant',
        timestamp: new Date(),
        model: activeModel?.name || 'unknown',
        error: true,
      };
      
      if (currentSession) {
        const errorSession = {
          ...currentSession,
          messages: [...currentSession.messages, errorMessage],
          updatedAt: new Date(),
        };
        
        setCurrentSession(errorSession);
        setChatSessions(prev => prev.map(s => s.id === errorSession.id ? errorSession : s));
        
        // Save the session with error message
        await StorageManager.saveChatSession(errorSession);
      }
      
      // Don't re-throw the error to prevent app crashes
      // The error is now displayed in the chat as an error message
    } finally {
      setIsLoading(false);
    }
  };

  const regenerateResponse = async (messageId: string) => {
    if (!currentSession || !activeModel || !isConnected) return;
    
    const messageIndex = currentSession.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1 || messageIndex === 0) return;
    
    const previousUserMessage = currentSession.messages[messageIndex - 1];
    if (previousUserMessage.sender !== 'user') return;
    
    // Remove the message to regenerate and all messages after it
    const updatedMessages = currentSession.messages.slice(0, messageIndex);
    const updatedSession = {
      ...currentSession,
      messages: updatedMessages,
    };
    
    setCurrentSession(updatedSession);
    
    // Regenerate response
    await sendMessage(previousUserMessage.text);
  };

  const setActiveModel = async (model: OllamaModel) => {
    setActiveModelState(model);
    await StorageManager.setActiveModel(model);
    
    // Update providers to reflect active state
    setProviders(prev => prev.map(provider => ({
      ...provider,
      models: provider.models.map(m => ({
        ...m,
        isActive: m.id === model.id
      }))
    })));
  };

  const refreshProviders = async () => {
    try {
      const providersData = await APIManager.getProviders();
      setProviders(providersData);
      setIsConnected(true);
      setConnectionError(null);
      
      // If no active model and we have models, set the first one as active
      if (!activeModel && providersData.length > 0 && providersData[0].models.length > 0) {
        await setActiveModel(providersData[0].models[0]);
      }
    } catch (error) {
      console.error('Failed to refresh providers:', error);
      setIsConnected(false);
      setConnectionError(error instanceof Error ? error.message : 'Connection failed');
      throw error; // Re-throw to handle in UI
    }
  };

  const refreshStats = async () => {
    try {
      const newStats = await StorageManager.getChatStats();
      setStats(newStats);
    } catch (error) {
      console.error('Failed to refresh stats:', error);
    }
  };

  const generateChatTitle = (firstMessage: string): string => {
    const words = firstMessage.split(' ').slice(0, 4);
    return words.join(' ') + (firstMessage.split(' ').length > 4 ? '...' : '');
  };

  return (
    <ChatContext.Provider value={{
      chatSessions,
      currentSession,
      createNewChat,
      switchToChat,
      deleteChat,
      deleteMultipleChats,
      updateChatTitle,
      sendMessage,
      regenerateResponse,
      isLoading,
      providers,
      activeModel,
      setActiveModel,
      refreshProviders,
      stats,
      refreshStats,
      isConnected,
      connectionError,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
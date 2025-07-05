import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ChatSession, Message, OllamaModel, ModelProvider, ChatStats } from '@/types/chat';
import { StorageManager } from '@/utils/storage';
import { APIManager } from '@/utils/api';
import { ChatContextType } from './chat.types';

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
  const [streamingMessage, setStreamingMessage] = useState<string | null>(null);

  useEffect(() => {
    initializeData();
  }, []);

  const initializeData = async () => {
    try {
      await Promise.all([
        loadChatSessions(),
        loadActiveModel(),
        refreshStats(),
      ]);
      try {
        await loadProviders();
        setIsConnected(true);
        setConnectionError(null);
      } catch (error) {
        setIsConnected(false);
        setConnectionError(error instanceof Error ? error.message : 'Connection failed');
      }
    } catch (error) {
      console.error('Failed to initialize data:', error);
    }
  };

  const loadChatSessions = async () => {
    try {
      const sessions = await StorageManager.getChatSessions();
      const normalizedSessions = sessions.map(s => ({ ...s, isActive: s.isActive ?? false }));
      setChatSessions(normalizedSessions);
      
      // Find the active session or default to the first one
      const activeSession = normalizedSessions.find(s => s.isActive);
      if (activeSession) {
        setCurrentSession(activeSession);
      } else if (normalizedSessions.length > 0) {
        // If no active session but sessions exist, make the first one active
        const firstSession = { ...normalizedSessions[0], isActive: true };
        setCurrentSession(firstSession);
        await StorageManager.saveChatSession(firstSession);
      }
    } catch (error) {
      console.error('Failed to load chat sessions:', error);
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
      if (providers.length > 0 && providers[0].models.length > 0) {
        await setActiveModel(providers[0].models[0]);
      } else {
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

    // Deactivate all existing sessions
    const updatedSessions = chatSessions.map(s => ({ ...s, isActive: false }));
    
    // Add new session at the beginning
    updatedSessions.unshift(newSession);
    
    setChatSessions(updatedSessions);
    setCurrentSession(newSession);
    
    // Save all sessions to update their active status
    await Promise.all([
      StorageManager.saveChatSession(newSession),
      ...chatSessions.map(s => StorageManager.saveChatSession({ ...s, isActive: false }))
    ]);
  };

  const switchToChat = async (sessionId: string) => {
    try {
      // Find the session to switch to
      const targetSession = chatSessions.find(s => s.id === sessionId);
      if (!targetSession) {
        console.error('Session not found:', sessionId);
        return;
      }

      // Update all sessions: deactivate current, activate target
      const updatedSessions = chatSessions.map(s => ({
        ...s,
        isActive: s.id === sessionId,
      }));

      setChatSessions(updatedSessions);
      setCurrentSession({ ...targetSession, isActive: true });

      // Save the updated active states to storage
      await Promise.all(updatedSessions.map(s => StorageManager.saveChatSession(s)));
    } catch (error) {
      console.error('Failed to switch chat:', error);
      throw error;
    }
  };

  const deleteChat = async (sessionId: string) => {
    try {
      console.log('[ChatContext] Deleting chat with ID:', sessionId);
      
      // Delete from storage
      await StorageManager.deleteChatSession(sessionId);
      
      // Update local state
      const updatedSessions = chatSessions.filter(s => s.id !== sessionId);
      setChatSessions(updatedSessions);

      // Handle current session logic
      if (currentSession?.id === sessionId) {
        if (updatedSessions.length > 0) {
          // Switch to the first available session
          const newActiveSession = { ...updatedSessions[0], isActive: true };
          setCurrentSession(newActiveSession);
          
          // Update all sessions to reflect new active state
          const sessionsWithActiveState = updatedSessions.map(s => ({
            ...s,
            isActive: s.id === newActiveSession.id,
          }));
          setChatSessions(sessionsWithActiveState);
          
          // Save updated active states
          await Promise.all(sessionsWithActiveState.map(s => StorageManager.saveChatSession(s)));
        } else {
          setCurrentSession(null);
        }
      }

      await refreshStats();
      console.log('[ChatContext] Chat deleted successfully');
    } catch (error) {
      console.error('[ChatContext] Failed to delete chat:', error);
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
    try {
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
    } catch (error) {
      console.error('Failed to update chat title:', error);
      throw error;
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
      
      // Create messages array that includes the new user message for API call
      const messagesToSend = [...currentSession.messages, userMessage];
      
      // Get response from API
      const response = await APIManager.sendMessage(text, activeModel!, messagesToSend);
      
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
        await StorageManager.saveChatSession(errorSession);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessageStream = async (text: string) => {
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
    setStreamingMessage('');
    
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

      // Create messages array that includes the new user message for API call
      const messagesToSend = [...currentSession.messages, userMessage];

      // Streaming response
      let responseText = '';
      setStreamingMessage('');
      
      for await (const token of APIManager.sendMessageStream(text, activeModel!, messagesToSend)) {
        responseText += token;
        setStreamingMessage(responseText);
      }
      
      setStreamingMessage(null);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: responseText,
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
      setStreamingMessage(null);
      console.error('Failed to send streaming message:', error);
      
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
        await StorageManager.saveChatSession(errorSession);
      }
    } finally {
      setIsLoading(false);
      setStreamingMessage(null);
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
      throw error;
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

  const clearAllDataAndReload = async () => {
    await StorageManager.clearAllData();
    await loadChatSessions();
    await loadActiveModel();
    await refreshStats();
    setProviders([]);
    setActiveModelState(null);
    setCurrentSession(null);
    setIsConnected(false);
    setConnectionError(null);
  };

  const handleClearRecentChats = async () => {
    // Remove all chat sessions from storage and memory
    await StorageManager.removeItem('chat_sessions');
    setChatSessions([]);
    setCurrentSession(null);
    await refreshStats();
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
      sendMessageStream,
      streamingMessage,
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
      clearAllDataAndReload,
      handleClearRecentChats,
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
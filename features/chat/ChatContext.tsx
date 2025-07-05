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
      // Only fail if we can't load local data
    }
  };

  const loadChatSessions = async () => {
    const sessions = await StorageManager.getChatSessions();
    const normalizedSessions = sessions.map(s => ({ ...s, isActive: s.isActive ?? false }));
    setChatSessions(normalizedSessions);
    const activeSession = normalizedSessions.find(s => s.isActive) || normalizedSessions[0];
    if (activeSession) setCurrentSession(activeSession);
  };

  const loadProviders = async () => {
    const providersData = await APIManager.getProviders();
    setProviders(providersData);
  };

  const loadActiveModel = async () => {
    const model = await StorageManager.getActiveModel();
    setActiveModelState(model);
  };

  const switchToChat = async (sessionId: string) => {
    // Always reload sessions from storage to ensure state is in sync
    await StorageManager.getChatSessions().then((sessions) => {
      const normalizedSessions = sessions.map(s => ({
        ...s,
        isActive: s.id === sessionId,
      }));
      setChatSessions(normalizedSessions);
      const session = normalizedSessions.find(s => s.id === sessionId);
      if (session) setCurrentSession({ ...session, isActive: true });
      // Save updated isActive state to storage
      Promise.all(normalizedSessions.map(s => StorageManager.saveChatSession(s)));
    });
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

    // Remove all old sessions from storage before creating a new one
    await StorageManager.removeItem('chat_sessions');
    const updatedSessions = [newSession];
    setChatSessions(updatedSessions);
    setCurrentSession(newSession);
    await StorageManager.saveChatSession(newSession);
  };

  const deleteChat = async (sessionId: string) => {
    try {
      console.log('[deleteChat] Attempting to delete chat with ID:', sessionId);
      console.log('[deleteChat] Current chatSessions:', chatSessions.map(s => s.id));
      console.log('[deleteChat] CurrentSession:', currentSession?.id);

      await StorageManager.deleteChatSession(sessionId);

      // Instead of filtering chatSessions, reload from storage to ensure sync
      await loadChatSessions();

      await refreshStats();
      console.log('[deleteChat] Finished deleteChat');
    } catch (error) {
      console.error('[deleteChat] Error:', error);
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
      throw error;
    }
  };

  const updateChatTitle = async (sessionId: string, title: string) => {
    const updatedSessions = chatSessions.map(s => s.id === sessionId ? { ...s, title, updatedAt: new Date() } : s);
    setChatSessions(updatedSessions);
    if (currentSession?.id === sessionId) setCurrentSession({ ...currentSession, title });
    const session = updatedSessions.find(s => s.id === sessionId);
    if (session) await StorageManager.saveChatSession(session);
  };

  const sendMessage = async (text: string) => {
    if (!activeModel || !isConnected) throw new Error('No AI connection available. Please configure your AI connection first.');
    if (isLoading) return;
    if (!currentSession) await createNewChat();
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
      let errorText = 'Failed to send message';
      if (error instanceof Error) errorText = error.message;
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
    if (!activeModel || !isConnected) throw new Error('No AI connection available. Please configure your AI connection first.');
    if (isLoading) return;
    if (!currentSession) await createNewChat();
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

      // Streaming response
      let responseText = '';
      let assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: '',
        sender: 'assistant',
        timestamp: new Date(),
        model: activeModel!.name,
        isStreaming: true,
      };
      setStreamingMessage('');
      for await (const token of APIManager.sendMessageStream(text, activeModel!, currentSession.messages)) {
        responseText += token;
        setStreamingMessage(responseText);
      }
      setStreamingMessage(null);

      assistantMessage = {
        ...assistantMessage,
        text: responseText,
        isStreaming: false,
        timestamp: new Date(),
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
      let errorText = 'Failed to send message';
      if (error instanceof Error) errorText = error.message;
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
    const updatedMessages = currentSession.messages.slice(0, messageIndex);
    const updatedSession = {
      ...currentSession,
      messages: updatedMessages,
    };
    setCurrentSession(updatedSession);
    await sendMessage(previousUserMessage.text);
  };

  const setActiveModel = async (model: OllamaModel) => {
    setActiveModelState(model);
    await StorageManager.setActiveModel(model);
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
      if (!activeModel && providersData.length > 0 && providersData[0].models.length > 0) {
        await setActiveModel(providersData[0].models[0]);
      }
    } catch (error) {
      setIsConnected(false);
      setConnectionError(error instanceof Error ? error.message : 'Connection failed');
      throw error;
    }
  };

  const refreshStats = async () => {
    try {
      const newStats = await StorageManager.getChatStats();
      setStats(newStats);
    } catch (error) {}
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
      sendMessageStream, // <-- add streaming version
      streamingMessage,   // <-- expose streaming message
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
      clearAllDataAndReload, // <-- add this to context if you want to call from UI
      handleClearRecentChats, // <-- add clear recent chats handler
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



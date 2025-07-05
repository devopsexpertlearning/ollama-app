// ...existing code from types/chat.ts...

// ChatContextType interface from contexts/ChatContext.tsx
export interface ChatContextType {
  chatSessions: import('@/types/chat').ChatSession[];
  currentSession: import('@/types/chat').ChatSession | null;
  createNewChat: () => Promise<void>;
  switchToChat: (sessionId: string) => Promise<void>;
  deleteChat: (sessionId: string) => Promise<void>;
  deleteMultipleChats: (sessionIds: string[]) => Promise<void>;
  updateChatTitle: (sessionId: string, title: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  sendMessageStream: (text: string) => Promise<void>; // <-- add
  streamingMessage: string | null; // <-- add
  regenerateResponse: (messageId: string) => Promise<void>;
  isLoading: boolean;
  providers: import('@/types/chat').ModelProvider[];
  activeModel: import('@/types/chat').OllamaModel | null;
  setActiveModel: (model: import('@/types/chat').OllamaModel) => Promise<void>;
  refreshProviders: () => Promise<void>;
  stats: import('@/types/chat').ChatStats;
  refreshStats: () => Promise<void>;
  isConnected: boolean;
  connectionError: string | null;
  clearAllDataAndReload: () => Promise<void>; // <-- add this line
  handleClearRecentChats: () => Promise<void>; // <-- add this line
}

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  model?: string;
  error?: boolean;
  isStreaming?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean; // <-- Make required
  isPinned?: boolean;
  tags?: string[];
}

export interface ModelProvider {
  id: string;
  name: string;
  type: 'ollama' | 'openai' | 'anthropic';
  baseUrl?: string;
  apiKey?: string;
  isEnabled: boolean;
  models: OllamaModel[];
}

export interface OllamaModel {
  id: string;
  name: string;
  displayName: string;
  description: string;
  size?: string;
  parameters?: string;
  isDownloaded: boolean;
  isActive: boolean;
  provider: string;
  capabilities: string[];
  contextLength?: number;
  lastUsed?: Date;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: boolean;
  autoSave: boolean;
  streamingEnabled: boolean;
  soundEnabled: boolean;
  
  // Model settings
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  
  // Simplified API configuration
  apiProvider: 'ollama' | 'openai' | 'anthropic';
  endpoint: string;
  apiKey: string;
  
  // UI preferences
  messageAnimations: boolean;
  compactMode: boolean;
  showTimestamps: boolean;
  fontSize: 'small' | 'medium' | 'large';
}

export interface ChatStats {
  totalChats: number;
  totalMessages: number;
  totalTokens: number;
  favoriteModel: string;
  averageResponseTime: number;
  dailyUsage: { date: string; messages: number }[];
}
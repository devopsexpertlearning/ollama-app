import { Platform } from 'react-native';
import { ChatSession, AppSettings, OllamaModel, ChatStats } from '@/types/chat';

export class StorageManager {
  private static isWeb = Platform.OS === 'web';

  static async setItem(key: string, value: string): Promise<void> {
    if (this.isWeb) {
      localStorage.setItem(key, value);
    } else {
      // In a real app, use AsyncStorage
      console.log(`Would save ${key}: ${value}`);
    }
  }

  static async getItem(key: string): Promise<string | null> {
    if (this.isWeb) {
      return localStorage.getItem(key);
    } else {
      // In a real app, use AsyncStorage
      console.log(`Would get ${key}`);
      return null;
    }
  }

  static async removeItem(key: string): Promise<void> {
    if (this.isWeb) {
      localStorage.removeItem(key);
    } else {
      // In a real app, use AsyncStorage
      console.log(`Would remove ${key}`);
    }
  }

  // Chat Sessions Management
  static async saveChatSession(session: ChatSession): Promise<void> {
    const sessions = await this.getChatSessions();
    const existingIndex = sessions.findIndex(s => s.id === session.id);
    
    if (existingIndex >= 0) {
      sessions[existingIndex] = session;
    } else {
      sessions.unshift(session); // Add to beginning
    }
    
    await this.setItem('chat_sessions', JSON.stringify(sessions));
  }

  static async getChatSessions(): Promise<ChatSession[]> {
    const sessionsData = await this.getItem('chat_sessions');
    if (!sessionsData) {
      console.log('[StorageManager.getChatSessions] No sessions found');
      return [];
    }
    try {
      const sessions = JSON.parse(sessionsData);
      console.log('[StorageManager.getChatSessions] Loaded sessions:', sessions.map((s: any) => s.id));
      return sessions.map((session: any) => ({
        ...session,
        createdAt: new Date(session.createdAt),
        updatedAt: new Date(session.updatedAt),
        messages: session.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
      }));
    } catch (e) {
      console.error('[StorageManager.getChatSessions] Failed to parse sessions:', e);
      return [];
    }
  }

  static async deleteChatSession(sessionId: string): Promise<void> {
    try {
      console.log('[StorageManager.deleteChatSession] Deleting session with ID:', sessionId);
      const sessions = await this.getChatSessions();
      console.log('[StorageManager.deleteChatSession] Sessions before delete:', sessions.map(s => s.id));
      const filteredSessions = sessions.filter(s => s.id !== sessionId);
      console.log('[StorageManager.deleteChatSession] Sessions after delete:', filteredSessions.map(s => s.id));
      await this.setItem('chat_sessions', JSON.stringify(filteredSessions));
      console.log('[StorageManager.deleteChatSession] Session deleted successfully');
    } catch (error) {
      console.error('[StorageManager.deleteChatSession] Failed to delete session:', error);
      throw error;
    }
  }

  static async deleteMultipleChatSessions(sessionIds: string[]): Promise<void> {
    try {
      console.log('StorageManager: Deleting multiple sessions:', sessionIds);
      
      const sessions = await this.getChatSessions();
      const filteredSessions = sessions.filter(s => !sessionIds.includes(s.id));
      
      await this.setItem('chat_sessions', JSON.stringify(filteredSessions));
      console.log('StorageManager: Multiple sessions deleted successfully');
    } catch (error) {
      console.error('StorageManager: Failed to delete multiple sessions:', error);
      throw error;
    }
  }

  // App Settings Management
  static async saveSettings(settings: Partial<AppSettings>): Promise<void> {
    const currentSettings = await this.getSettings();
    const updatedSettings = { ...currentSettings, ...settings };
    await this.setItem('app_settings', JSON.stringify(updatedSettings));
  }

  static async getSettings(): Promise<AppSettings> {
    const settingsData = await this.getItem('app_settings');
    
    const defaultSettings: AppSettings = {
      theme: 'system',
      language: 'en',
      notifications: true,
      autoSave: true,
      streamingEnabled: true,
      soundEnabled: false,
      
      temperature: 0.7,
      maxTokens: 2048,
      topP: 0.9,
      frequencyPenalty: 0,
      presencePenalty: 0,
      
      // Simplified API configuration
      apiProvider: 'ollama',
      endpoint: 'http://localhost:11434',
      apiKey: '',
      
      messageAnimations: true,
      compactMode: false,
      showTimestamps: true,
      fontSize: 'medium',
    };

    if (!settingsData) return defaultSettings;
    
    try {
      return { ...defaultSettings, ...JSON.parse(settingsData) };
    } catch {
      return defaultSettings;
    }
  }

  // Active Model Management
  static async setActiveModel(model: OllamaModel): Promise<void> {
    await this.setItem('active_model', JSON.stringify(model));
  }

  static async getActiveModel(): Promise<OllamaModel | null> {
    const modelData = await this.getItem('active_model');
    if (!modelData) return null;
    
    try {
      return JSON.parse(modelData);
    } catch {
      return null;
    }
  }

  // Chat Statistics
  static async getChatStats(): Promise<ChatStats> {
    const sessions = await this.getChatSessions();
    
    const totalChats = sessions.length;
    const totalMessages = sessions.reduce((sum, session) => sum + session.messages.length, 0);
    
    // Calculate favorite model with proper empty array handling
    const modelUsage: { [key: string]: number } = {};
    sessions.forEach(session => {
      modelUsage[session.model] = (modelUsage[session.model] || 0) + 1;
    });
    
    // Handle empty modelUsage object to prevent reduce error
    let favoriteModel = '';
    const modelEntries = Object.entries(modelUsage);
    if (modelEntries.length > 0) {
      favoriteModel = modelEntries.reduce((a, b) => 
        modelUsage[a[0]] > modelUsage[b[0]] ? a : b
      )[0];
    }
    
    // Calculate daily usage for last 30 days
    const dailyUsage: { date: string; messages: number }[] = [];
    const now = new Date();
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const messagesOnDate = sessions.reduce((sum, session) => {
        return sum + session.messages.filter(msg => 
          msg.timestamp.toISOString().split('T')[0] === dateStr
        ).length;
      }, 0);
      
      dailyUsage.push({ date: dateStr, messages: messagesOnDate });
    }
    
    return {
      totalChats,
      totalMessages,
      totalTokens: totalMessages * 50, // Rough estimate
      favoriteModel,
      averageResponseTime: 1.2, // Placeholder
      dailyUsage,
    };
  }

  // Clear all data (sessions, settings, model) and browser cache if web
  static async clearAllData(): Promise<void> {
    if (this.isWeb) {
      // Log current localStorage before clearing
      console.log('[StorageManager.clearAllData] localStorage before clear:', { ...localStorage });
      // Clear all localStorage
      localStorage.clear();
      // Log after clearing
      console.log('[StorageManager.clearAllData] localStorage after clear:', { ...localStorage });
      // Clear browser cache if supported
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        console.log('[StorageManager.clearAllData] Cache keys before clear:', cacheKeys);
        await Promise.all(cacheKeys.map(key => caches.delete(key)));
        const cacheKeysAfter = await caches.keys();
        console.log('[StorageManager.clearAllData] Cache keys after clear:', cacheKeysAfter);
      }
      console.log('[StorageManager.clearAllData] Cleared localStorage and browser cache');
      // Force reload to reset all in-memory state
      window.location.reload();
    } else {
      // In a real app, use AsyncStorage.clear()
      // Fallback: remove known keys (simulate clear)
      console.log('[StorageManager.clearAllData] Removing keys: chat_sessions, app_settings, active_model');
      await this.removeItem('chat_sessions');
      await this.removeItem('app_settings');
      await this.removeItem('active_model');
      console.log('[StorageManager.clearAllData] Cleared all AsyncStorage keys');
    }
  }
}
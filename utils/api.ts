import { Message, OllamaModel, ModelProvider } from '@/types/chat';
import { StorageManager } from './storage';
import { Platform } from 'react-native';

export interface APIConfig {
  provider: 'ollama' | 'openai' | 'anthropic';
  endpoint: string;
  apiKey?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export class APIManager {
  private static async getSettings() {
    return await StorageManager.getSettings();
  }

  private static validateEndpointURL(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return ['http:', 'https:'].includes(parsedUrl.protocol);
    } catch {
      return false;
    }
  }

  private static isLocalhostURL(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1';
    } catch {
      return false;
    }
  }

  private static isHTTPSRequired(): boolean {
    // Check if we're running in a web browser with HTTPS
    return Platform.OS === 'web' && typeof window !== 'undefined' && window.location.protocol === 'https:';
  }

  private static createAPIConfig(settings: any): APIConfig {
    const config: APIConfig = {
      provider: settings.apiProvider,
      endpoint: settings.endpoint,
      timeout: 20000, // Increased timeout for remote servers
    };

    // Validate endpoint URL
    if (!this.validateEndpointURL(config.endpoint)) {
      throw new Error(`Invalid endpoint URL: ${config.endpoint}`);
    }

    // Check for mixed content issues on web
    if (this.isHTTPSRequired() && config.endpoint.startsWith('http://')) {
      throw new Error('MIXED_CONTENT_ERROR');
    }

    // Add API key for non-Ollama providers
    if (settings.apiProvider !== 'ollama') {
      if (!settings.apiKey?.trim()) {
        throw new Error(`API key is required for ${settings.apiProvider.toUpperCase()}`);
      }
      config.apiKey = settings.apiKey;
    }

    // Set provider-specific headers
    config.headers = this.getProviderHeaders(settings.apiProvider, settings.apiKey);

    return config;
  }

  private static getProviderHeaders(provider: string, apiKey?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    switch (provider) {
      case 'openai':
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
        break;
      case 'anthropic':
        if (apiKey) {
          headers['x-api-key'] = apiKey;
          headers['anthropic-version'] = '2023-06-01';
        }
        break;
      case 'ollama':
        // Ollama doesn't require authentication headers by default
        break;
    }

    return headers;
  }

  private static async makeAPIRequest(
    url: string, 
    options: RequestInit, 
    config: APIConfig
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout || 20000);

    try {
      // For web platform, use a proxy approach for CORS issues
      let requestUrl = url;
      let requestOptions = {
        ...options,
        headers: {
          ...config.headers,
          ...options.headers,
        },
        signal: controller.signal,
      };

      // Handle CORS for web platform
      if (Platform.OS === 'web' && config.provider === 'ollama') {
        // Try direct request first, fallback to proxy if needed
        try {
          const response = await fetch(requestUrl, requestOptions);
          clearTimeout(timeoutId);
          return response;
        } catch (corsError) {
          // If CORS error, suggest using HTTPS endpoint or proxy
          if (corsError instanceof TypeError && corsError.message.includes('Failed to fetch')) {
            throw new Error('CORS_ERROR');
          }
          throw corsError;
        }
      }

      const response = await fetch(requestUrl, requestOptions);
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout - please check your connection and try again');
      }
      
      // Enhanced error handling for common connection issues
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        if (Platform.OS === 'web') {
          throw new Error(
            'CORS_ERROR: Your browser blocked this request due to CORS. ' +
            'To fix, set OLLAMA_ORIGINS="http://localhost:8081" on your Ollama server and restart it. ' +
            'See https://github.com/ollama/ollama/blob/main/docs/api.md#cors for details.'
          );
        }
        throw new Error('Cannot connect to server - please check the endpoint URL and network connectivity');
      }
      
      throw error;
    }
  }

  static async getProviders(): Promise<ModelProvider[]> {
    const settings = await this.getSettings();
    const providers: ModelProvider[] = [];

    try {
      const config = this.createAPIConfig(settings);
      
      switch (config.provider) {
        case 'ollama':
          const ollamaModels = await this.getOllamaModels(config);
          providers.push({
            id: 'ollama',
            name: 'Ollama',
            type: 'ollama',
            baseUrl: config.endpoint,
            isEnabled: true,
            models: ollamaModels,
          });
          break;

        case 'openai':
          providers.push({
            id: 'openai',
            name: 'OpenAI',
            type: 'openai',
            baseUrl: config.endpoint,
            apiKey: config.apiKey,
            isEnabled: true,
            models: this.getOpenAIModels(),
          });
          break;

        case 'anthropic':
          providers.push({
            id: 'anthropic',
            name: 'Anthropic',
            type: 'anthropic',
            baseUrl: config.endpoint,
            apiKey: config.apiKey,
            isEnabled: true,
            models: this.getAnthropicModels(),
          });
          break;
      }
    } catch (error) {
      console.warn(`Failed to load ${settings.apiProvider} models:`, error);
      throw error; // Re-throw to handle in UI
    }

    return providers;
  }

  private static async getOllamaModels(config: APIConfig): Promise<OllamaModel[]> {
    const url = `${config.endpoint.replace(/\/$/, '')}/api/tags`;
    
    try {
      const response = await this.makeAPIRequest(url, { method: 'GET' }, config);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Ollama API endpoint not found - please verify the server URL');
        } else if (response.status >= 500) {
          throw new Error('Ollama server error - please check if the server is running properly');
        } else {
          throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
        }
      }

      const data = await response.json();
      console.log('Ollama API response:', data); // Debug log
      
      // Handle the response format from your server
      let models: any[] = [];
      
      if (data.models && Array.isArray(data.models)) {
        models = data.models;
      } else if (Array.isArray(data)) {
        // Some Ollama versions might return an array directly
        models = data;
      } else if (data.data && Array.isArray(data.data)) {
        // Alternative response format
        models = data.data;
      } else {
        console.warn('Unexpected Ollama response format:', data);
        throw new Error('Invalid response format from Ollama server - expected models array');
      }

      if (models.length === 0) {
        throw new Error('No models available from this provider');
      }

      return models.map((model: any, index: number) => {
        // Handle the specific format from your server
        const modelName = model.name || model.model || model.id || `model-${index}`;
        const modelSize = model.size || 0;
        const modifiedAt = model.modified_at || Date.now();
        const details = model.details || {};
        
        // Extract display name (remove tag if present)
        const displayName = modelName.includes(':') ? modelName.split(':')[0] : modelName;
        
        // Create description from available details
        let description = `Ollama model: ${modelName}`;
        if (details.parameter_size) {
          description += ` (${details.parameter_size})`;
        }
        if (details.quantization_level) {
          description += ` - ${details.quantization_level}`;
        }
        
        return {
          id: `ollama-${modelName}`,
          name: modelName,
          displayName: displayName,
          description: description,
          size: this.formatBytes(modelSize),
          parameters: details.parameter_size || this.extractParameters(modelName),
          isDownloaded: true,
          isActive: false,
          provider: 'ollama',
          capabilities: ['chat', 'completion'],
          contextLength: this.getContextLength(modelName, details.family),
          lastUsed: new Date(modifiedAt),
        };
      });
    } catch (error) {
      if (error instanceof Error) {
        // Handle CORS error specifically
        if (error.message === 'CORS_ERROR') {
          throw new Error('CORS_ERROR');
        }
        // Enhanced error messages for common issues
        if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
          throw new Error('Cannot connect to Ollama server - please check the endpoint URL and ensure the server is accessible');
        }
      }
      throw error;
    }
  }

  private static getContextLength(modelName: string, family?: string): number {
    // Determine context length based on model name and family
    const name = modelName.toLowerCase();
    
    if (name.includes('gemma')) return 8192;
    if (name.includes('deepseek')) return 32768;
    if (name.includes('qwen')) return 32768;
    if (name.includes('llama')) return 4096;
    if (name.includes('mistral')) return 8192;
    if (name.includes('codellama')) return 16384;
    
    // Default context length
    return 4096;
  }

  private static getOpenAIModels(): OllamaModel[] {
    return [
      {
        id: 'openai-gpt-4o',
        name: 'gpt-4o',
        displayName: 'GPT-4o',
        description: 'Most advanced GPT-4 model with vision capabilities',
        isDownloaded: true,
        isActive: false,
        provider: 'openai',
        capabilities: ['chat', 'vision', 'function-calling'],
        contextLength: 128000,
      },
      {
        id: 'openai-gpt-4o-mini',
        name: 'gpt-4o-mini',
        displayName: 'GPT-4o Mini',
        description: 'Faster and more affordable GPT-4 model',
        isDownloaded: true,
        isActive: false,
        provider: 'openai',
        capabilities: ['chat', 'vision', 'function-calling'],
        contextLength: 128000,
      },
      {
        id: 'openai-gpt-3.5-turbo',
        name: 'gpt-3.5-turbo',
        displayName: 'GPT-3.5 Turbo',
        description: 'Fast and efficient GPT-3.5 model',
        isDownloaded: true,
        isActive: false,
        provider: 'openai',
        capabilities: ['chat', 'function-calling'],
        contextLength: 16385,
      },
    ];
  }

  private static getAnthropicModels(): OllamaModel[] {
    return [
      {
        id: 'anthropic-claude-3-5-sonnet',
        name: 'claude-3-5-sonnet-20241022',
        displayName: 'Claude 3.5 Sonnet',
        description: 'Most intelligent Claude model',
        isDownloaded: true,
        isActive: false,
        provider: 'anthropic',
        capabilities: ['chat', 'vision', 'analysis'],
        contextLength: 200000,
      },
      {
        id: 'anthropic-claude-3-opus',
        name: 'claude-3-opus-20240229',
        displayName: 'Claude 3 Opus',
        description: 'Powerful model for complex tasks',
        isDownloaded: true,
        isActive: false,
        provider: 'anthropic',
        capabilities: ['chat', 'vision', 'analysis'],
        contextLength: 200000,
      },
      {
        id: 'anthropic-claude-3-haiku',
        name: 'claude-3-haiku-20240307',
        displayName: 'Claude 3 Haiku',
        description: 'Fast and efficient Claude model',
        isDownloaded: true,
        isActive: false,
        provider: 'anthropic',
        capabilities: ['chat', 'analysis'],
        contextLength: 200000,
      },
    ];
  }

  static async sendMessage(
    message: string,
    model: OllamaModel,
    conversationHistory: Message[] = []
  ): Promise<string> {
    const settings = await this.getSettings();
    
    try {
      const config = this.createAPIConfig(settings);
      
      switch (config.provider) {
        case 'openai':
          return await this.sendOpenAIMessage(message, model, conversationHistory, config);
        case 'anthropic':
          return await this.sendAnthropicMessage(message, model, conversationHistory, config);
        case 'ollama':
        default:
          return await this.sendOllamaMessage(message, model, conversationHistory, config);
      }
    } catch (error) {
      console.error('API Error:', error);
      
      // Enhanced error handling for better user experience
      if (error instanceof Error) {
        // Handle authentication errors specifically
        if (error.message.includes('401') || error.message.includes('Incorrect API key')) {
          throw new Error('Invalid API key. Please check your API key in the connection settings and ensure it\'s correct.');
        }
        
        // Handle rate limiting
        if (error.message.includes('429') || error.message.includes('rate limit')) {
          throw new Error('Rate limit exceeded. Please wait a moment before sending another message.');
        }
        
        // Handle quota/billing issues
        if (error.message.includes('quota') || error.message.includes('billing')) {
          throw new Error('API quota exceeded or billing issue. Please check your account status.');
        }
        
        // Handle network issues
        if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
          throw new Error('Network connection failed. Please check your internet connection and try again.');
        }
        
        // Handle server errors
        if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) {
          throw new Error('Server temporarily unavailable. Please try again in a few moments.');
        }
      }
      
      throw new Error(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static async sendOllamaMessage(
    message: string,
    model: OllamaModel,
    history: Message[],
    config: APIConfig
  ): Promise<string> {
    const url = `${config.endpoint.replace(/\/$/, '')}/api/generate`;
    
    const requestBody = {
      model: model.name,
      prompt: this.buildPrompt(message, history),
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 2048,
        top_p: 0.9,
      },
    };

    try {
      const response = await this.makeAPIRequest(url, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      }, config);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Model not found on Ollama server - please ensure the model is installed');
        } else if (response.status >= 500) {
          throw new Error('Ollama server error - please check server status');
        } else {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
        }
      }

      const data = await response.json();
      return data.response || 'No response received';
    } catch (error) {
      if (error instanceof Error && error.message.includes('CORS_ERROR')) {
        throw new Error('CORS configuration required. Please configure CORS on your Ollama server or use HTTPS.');
      }
      throw error;
    }
  }

  private static async sendOpenAIMessage(
    message: string,
    model: OllamaModel,
    history: Message[],
    config: APIConfig
  ): Promise<string> {
    const url = `${config.endpoint.replace(/\/$/, '')}/chat/completions`;
    const messages = this.buildOpenAIMessages(message, history);

    const requestBody = {
      model: model.name,
      messages,
      temperature: 0.7,
      max_tokens: 2048,
      top_p: 0.9,
    };

    try {
      const response = await this.makeAPIRequest(url, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      }, config);

      if (!response.ok) {
        let errorMessage = `OpenAI API error: ${response.status}`;
        
        try {
          const errorData = await response.json();
          if (errorData.error?.message) {
            errorMessage += ` - ${errorData.error.message}`;
          }
        } catch {
          errorMessage += ` ${response.statusText}`;
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || 'No response received';
    } catch (error) {
      throw error;
    }
  }

  private static async sendAnthropicMessage(
    message: string,
    model: OllamaModel,
    history: Message[],
    config: APIConfig
  ): Promise<string> {
    const url = `${config.endpoint.replace(/\/$/, '')}/messages`;

    const requestBody = {
      model: model.name,
      max_tokens: 2048,
      temperature: 0.7,
      top_p: 0.9,
      messages: this.buildAnthropicMessages(message, history),
    };

    try {
      const response = await this.makeAPIRequest(url, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      }, config);

      if (!response.ok) {
        let errorMessage = `Anthropic API error: ${response.status}`;
        
        try {
          const errorData = await response.json();
          if (errorData.error?.message) {
            errorMessage += ` - ${errorData.error.message}`;
          }
        } catch {
          errorMessage += ` ${response.statusText}`;
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data.content[0]?.text || 'No response received';
    } catch (error) {
      throw error;
    }
  }

  private static buildPrompt(message: string, history: Message[]): string {
    let prompt = '';
    
    history.slice(-10).forEach(msg => {
      if (msg.sender === 'user') {
        prompt += `Human: ${msg.text}\n`;
      } else {
        prompt += `Assistant: ${msg.text}\n`;
      }
    });
    
    prompt += `Human: ${message}\nAssistant: `;
    return prompt;
  }

  private static buildOpenAIMessages(message: string, history: Message[]) {
    const messages = [
      { role: 'system', content: 'You are a helpful AI assistant.' }
    ];
    
    history.slice(-20).forEach(msg => {
      messages.push({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
      });
    });
    
    messages.push({ role: 'user', content: message });
    return messages;
  }

  private static buildAnthropicMessages(message: string, history: Message[]) {
    const messages: any[] = [];
    
    history.slice(-20).forEach(msg => {
      messages.push({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
      });
    });
    
    messages.push({ role: 'user', content: message });
    return messages;
  }

  private static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private static extractParameters(modelName: string): string {
    if (modelName.includes('70b')) return '70B';
    if (modelName.includes('13b')) return '13B';
    if (modelName.includes('14b')) return '14B';
    if (modelName.includes('8b')) return '8B';
    if (modelName.includes('7b')) return '7B';
    if (modelName.includes('4b')) return '4B';
    if (modelName.includes('3b')) return '3B';
    if (modelName.includes('1b')) return '1B';
    return 'Unknown';
  }

  // --- Streaming API for Ollama ---
  static async *sendOllamaMessageStream(
    message: string,
    model: OllamaModel,
    history: Message[],
    config: APIConfig
  ): AsyncGenerator<string, void, unknown> {
    const url = `${config.endpoint.replace(/\/$/, '')}/api/generate`;
    const requestBody = {
      model: model.name,
      prompt: this.buildPrompt(message, history),
      stream: true,
      options: {
        temperature: 0.7,
        num_predict: 2048,
        top_p: 0.9,
      },
    };

    const response = await this.makeAPIRequest(url, {
      method: 'POST',
      body: JSON.stringify(requestBody),
    }, config);

    if (!response.ok) {
      throw new Error(`Ollama streaming error: ${response.status} ${response.statusText}`);
    }

    // Stream NDJSON lines
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Streaming not supported in this environment');

    let decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (typeof data.response === 'string') {
            yield data.response;
          }
        } catch {
          // Ignore parse errors for incomplete lines
        }
      }
    }
  }

  // Streaming message for Ollama only (for now)
  static async *sendMessageStream(
    message: string,
    model: OllamaModel,
    conversationHistory: Message[] = []
  ): AsyncGenerator<string, void, unknown> {
    const settings = await this.getSettings();
    const config = this.createAPIConfig(settings);

    if (config.provider === 'ollama') {
      yield* this.sendOllamaMessageStream(message, model, conversationHistory, config);
    } else {
      throw new Error('Streaming is only supported for Ollama in this app.');
    }
  }

  // Utility method to test connection with custom configuration
  static async testConnection(
    provider: 'ollama' | 'openai' | 'anthropic',
    endpoint: string,
    apiKey?: string
  ): Promise<{ success: boolean; models?: OllamaModel[]; error?: string }> {
    try {
      const config: APIConfig = {
        provider,
        endpoint,
        apiKey,
        timeout: 20000, // Increased timeout for remote servers
      };

      // Validate configuration
      if (!this.validateEndpointURL(endpoint)) {
        throw new Error('Invalid endpoint URL format');
      }

      // Check for mixed content issues
      if (this.isHTTPSRequired() && endpoint.startsWith('http://')) {
        throw new Error('MIXED_CONTENT_ERROR');
      }

      if (provider !== 'ollama' && !apiKey?.trim()) {
        throw new Error(`API key is required for ${provider.toUpperCase()}`);
      }

      config.headers = this.getProviderHeaders(provider, apiKey);

      let models: OllamaModel[] = [];

      switch (provider) {
        case 'ollama':
          models = await this.getOllamaModels(config);
          break;
        case 'openai':
          models = this.getOpenAIModels();
          // Test the API key with a simple request
          await this.testOpenAIConnection(config);
          break;
        case 'anthropic':
          models = this.getAnthropicModels();
          // Test the API key with a simple request
          await this.testAnthropicConnection(config);
          break;
      }

      return { success: true, models };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  private static async testOpenAIConnection(config: APIConfig): Promise<void> {
    const url = `${config.endpoint.replace(/\/$/, '')}/models`;
    
    try {
      const response = await this.makeAPIRequest(url, { method: 'GET' }, config);
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid API key provided. Please check your OpenAI API key.');
        }
        throw new Error(`OpenAI API test failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('401')) {
        throw new Error('Invalid API key provided. Please check your OpenAI API key.');
      }
      throw error;
    }
  }

  private static async testAnthropicConnection(config: APIConfig): Promise<void> {
    // For Anthropic, we'll just validate the API key format since they don't have a simple test endpoint
    if (!config.apiKey || !config.apiKey.startsWith('sk-ant-')) {
      throw new Error('Invalid Anthropic API key format. API keys should start with "sk-ant-"');
    }
  }
}
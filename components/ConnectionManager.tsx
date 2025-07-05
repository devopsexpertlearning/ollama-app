import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { Check, TriangleAlert as AlertTriangle, Loader, ChevronDown, Server, Zap, X, RefreshCw } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { StorageManager } from '@/utils/storage';
import { APIManager } from '@/utils/api';
import { AppSettings, OllamaModel, ModelProvider } from '@/types/chat';

interface ConnectionManagerProps {
  visible: boolean;
  onClose: () => void;
  onConnectionSuccess: () => void;
}

export default function ConnectionManager({ visible, onClose, onConnectionSuccess }: ConnectionManagerProps) {
  const { theme } = useTheme();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<OllamaModel | null>(null);
  const [modelSelectorVisible, setModelSelectorVisible] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (visible) {
      loadSettings();
    }
  }, [visible]);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const currentSettings = await StorageManager.getSettings();
      setSettings(currentSettings);
      setHasChanges(false);
      setConnectionStatus('idle');
      setConnectionError(null);
      
      // Load current active model
      const activeModel = await StorageManager.getActiveModel();
      setSelectedModel(activeModel);
    } catch (error) {
      console.error('Failed to load settings:', error);
      Alert.alert('Error', 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const updateSetting = (key: keyof AppSettings, value: any) => {
    if (!settings) return;
    
    const newSettings = { ...settings, [key]: value };
    
    // Auto-update endpoint when provider changes
    if (key === 'apiProvider') {
      switch (value) {
        case 'ollama':
          newSettings.endpoint = 'http://localhost:11434';
          newSettings.apiKey = '';
          break;
        case 'openai':
          newSettings.endpoint = 'https://api.openai.com/v1';
          break;
      }
    }
    
    setSettings(newSettings);
    setHasChanges(true);
    setConnectionStatus('idle');
    setConnectionError(null);
    setAvailableModels([]);
    setSelectedModel(null);
  };

  const validateInputs = (): string | null => {
    if (!settings) return 'Settings not loaded';
    
    if (!settings.endpoint.trim()) {
      return 'Please enter an API endpoint';
    }

    // Validate URL format
    try {
      new URL(settings.endpoint);
    } catch {
      return 'Please enter a valid URL (e.g., http://localhost:11434)';
    }

    // Check for mixed content issues on web
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.protocol === 'https:' && settings.endpoint.startsWith('http://')) {
      return 'MIXED_CONTENT_ERROR';
    }

    if (settings.apiProvider !== 'ollama' && !settings.apiKey.trim()) {
      return `Please enter your ${settings.apiProvider.toUpperCase()} API key`;
    }

    return null;
  };

  const testConnection = async () => {
    if (!settings) return;

    // Validate inputs first
    const validationError = validateInputs();
    if (validationError) {
      setConnectionStatus('error');
      if (validationError === 'MIXED_CONTENT_ERROR') {
        setConnectionError('MIXED_CONTENT_ERROR');
      } else {
        setConnectionError(validationError);
      }
      return;
    }

    setIsTesting(true);
    setConnectionStatus('testing');
    setConnectionError(null);

    try {
      // Use the new testConnection method from APIManager
      const result = await APIManager.testConnection(
        settings.apiProvider,
        settings.endpoint,
        settings.apiKey
      );

      if (result.success && result.models) {
        setAvailableModels(result.models);
        setConnectionStatus('success');
        
        // Auto-select first model if none selected
        if (!selectedModel && result.models.length > 0) {
          setSelectedModel(result.models[0]);
        }
      } else {
        throw new Error(result.error || 'Connection test failed');
      }

    } catch (error: any) {
      console.error('Connection test failed:', error);
      setConnectionStatus('error');
      
      let errorMessage = 'Connection failed';
      let troubleshootingTips = '';

      // Handle mixed content error specifically
      if (error.message === 'MIXED_CONTENT_ERROR') {
        errorMessage = 'Mixed Content Security Error';
        troubleshootingTips = `Your server is using HTTP, but this web app is served over HTTPS. Browsers block mixed content for security.

Solutions:
1. Use HTTPS for your server:
   • Set up SSL/TLS certificates for your server
   • Access your server via https://18.163.115.90:11434

2. Use a reverse proxy with SSL:
   • Set up nginx or Apache with SSL
   • Proxy requests to your HTTP server

3. Alternative providers:
   • Use OpenAI (they use HTTPS)
   • These work seamlessly in web browsers

4. For development only:
   • Use a local HTTP server (not recommended for production)
   • Or test on mobile where this restriction doesn't apply`;
      }
      // Handle CORS error specifically for web platform
      else if (error.message === 'CORS_ERROR') {
        errorMessage = 'Web Browser CORS Restriction';
        troubleshootingTips = `Web browsers block cross-origin requests for security. For your remote server:

1. Configure CORS in your server:
   • Set environment variable: OLLAMA_ORIGINS="*"
   • Or for specific origin: OLLAMA_ORIGINS="https://bolt.new"

2. Restart your server after setting the environment variable

3. Alternative solutions:
   • Use a reverse proxy with CORS headers
   • Use OpenAI for web deployment
   • Test on mobile where CORS doesn't apply

4. For production web apps:
   • Consider using cloud-hosted AI services
   • They're designed for web integration`;
      }
      // Handle specific "No models available" error
      else if (error.message === 'No models available from this provider') {
        if (settings.apiProvider === 'ollama') {
          errorMessage = 'No models found on server';
          troubleshootingTips = 'Troubleshooting:\n\n• Ensure your server is running\n• Download models using: ollama pull <model_name>\n• Try: ollama pull llama2 or ollama pull mistral\n• Verify models are installed: ollama list\n• For web development, configure CORS:\n  export OLLAMA_ORIGINS="*"\n• Restart server after setting environment variables';
        } else {
          errorMessage = 'No models available from API provider';
          troubleshootingTips = 'Troubleshooting:\n\n• Verify your API key is correct and active\n• Check that your account has access to models\n• Ensure your API key has the necessary permissions\n• Contact your API provider if the issue persists';
        }
      } else if (error.message.includes('Cannot connect') || error.message.includes('Failed to fetch') || error.name === 'TypeError') {
        if (settings.apiProvider === 'ollama') {
          errorMessage = 'Cannot connect to server';
          if (Platform.OS === 'web') {
            troubleshootingTips = `Troubleshooting for Web Browser:

Network Issues:
• Ensure your server at ${settings.endpoint} is accessible
• Check if the server is running and responding
• Verify the IP address and port are correct

Security Restrictions:
• Web browsers have strict security policies
• HTTPS sites cannot connect to HTTP servers (Mixed Content)
• Cross-origin requests require CORS configuration

Recommended Solutions:
1. Use HTTPS for your server
2. Configure CORS: OLLAMA_ORIGINS="*"
3. Use OpenAI for web deployment
4. Test on mobile for fewer restrictions`;
          } else {
            troubleshootingTips = 'Troubleshooting:\n\n• Ensure your server is running\n• Check the server URL is correct\n• Verify the port number (default: 11434)\n• For web development, configure CORS:\n  export OLLAMA_ORIGINS="*"\n• Restart server after setting environment variables\n• Try accessing the endpoint directly in your browser';
          }
        } else {
          errorMessage = 'Network connection failed';
          troubleshootingTips = 'Please check your internet connection and API endpoint URL';
        }
      } else if (error.message.includes('401') || error.message.includes('403') || error.message.includes('Authentication')) {
        errorMessage = 'Authentication failed';
        troubleshootingTips = 'Please verify your API key is correct and has necessary permissions';
      } else if (error.message.includes('404') || error.message.includes('not found')) {
        errorMessage = 'API endpoint not found';
        troubleshootingTips = 'Please verify the API endpoint URL is correct';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Connection timeout';
        troubleshootingTips = 'The server took too long to respond. Please check your connection and try again.';
      } else if (error.message.includes('Invalid endpoint URL')) {
        errorMessage = 'Invalid URL format';
        troubleshootingTips = 'Please enter a valid URL (e.g., http://localhost:11434 or https://api.openai.com/v1)';
      } else {
        errorMessage = error.message || 'Unknown connection error';
        troubleshootingTips = 'Please check your configuration and try again';
      }

      setConnectionError(`${errorMessage}\n\n${troubleshootingTips}`);
    } finally {
      setIsTesting(false);
    }
  };

  const saveConfiguration = async () => {
    if (!settings || !selectedModel) {
      Alert.alert('Error', 'Please test connection and select a model first');
      return;
    }

    setIsSaving(true);
    try {
      await StorageManager.saveSettings(settings);
      await StorageManager.setActiveModel(selectedModel);
      
      setHasChanges(false);
      onConnectionSuccess();
      onClose();
      
      Alert.alert('Success', 'Configuration saved successfully!');
    } catch (error) {
      console.error('Failed to save configuration:', error);
      Alert.alert('Error', 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'ollama':
        return <Server color={theme.colors.primary} size={20} strokeWidth={2} />;
      case 'openai':
        return <Zap color={theme.colors.success} size={20} strokeWidth={2} />;
      default:
        return <Server color={theme.colors.textMuted} size={20} strokeWidth={2} />;
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'success':
        return theme.colors.success;
      case 'error':
        return theme.colors.error;
      case 'testing':
        return theme.colors.primary;
      default:
        return theme.colors.textMuted;
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'success':
        return `${settings?.apiProvider.toUpperCase()} Connected`;
      case 'error':
        return 'Connection Failed';
      case 'testing':
        return 'Testing Connection...';
      default:
        return 'Not Connected';
    }
  };

  const getEndpointPlaceholder = () => {
    switch (settings?.apiProvider) {
      case 'ollama':
        return Platform.OS === 'web' ? 'https://your-server.com:11434' : 'http://localhost:11434';
      case 'openai':
        return 'https://api.openai.com/v1';
      default:
        return 'Enter API endpoint URL';
    }
  };

  const getEndpointDescription = () => {
    switch (settings?.apiProvider) {
      case 'ollama':
        if (Platform.OS === 'web') {
          return 'HTTPS URL for your server. Web browsers require HTTPS and CORS configuration. For HTTP servers, consider using OpenAI instead.';
        }
        return 'URL where your server is running (e.g., http://localhost:11434 or http://192.168.1.100:11434)';
      case 'openai':
        return 'OpenAI API endpoint URL (default: https://api.openai.com/v1)';
      default:
        return 'API endpoint URL for the selected provider';
    }
  };

  const renderModelSelector = () => (
    <Modal
      visible={modelSelectorVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setModelSelectorVisible(false)}
    >
      <TouchableOpacity 
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setModelSelectorVisible(false)}
      >
        <View style={[styles.modelSelectorModal, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.colors.border }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text, fontFamily: theme.typography.weights.bold }]}>
              Select Model
            </Text>
            <TouchableOpacity onPress={() => setModelSelectorVisible(false)}>
              <X color={theme.colors.text} size={24} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modelsList} showsVerticalScrollIndicator={false}>
            {availableModels.map((model) => (
              <TouchableOpacity
                key={model.id}
                style={[
                  styles.modelItem,
                  selectedModel?.id === model.id && { backgroundColor: theme.colors.primary + '20' }
                ]}
                onPress={() => {
                  setSelectedModel(model);
                  setModelSelectorVisible(false);
                }}
              >
                <View style={[styles.modelIcon, { backgroundColor: theme.colors.surface }]}>
                  {getProviderIcon(model.provider)}
                </View>
                
                <View style={styles.modelInfo}>
                  <Text style={[
                    styles.modelName,
                    { 
                      color: selectedModel?.id === model.id ? theme.colors.primary : theme.colors.text,
                      fontFamily: theme.typography.weights.semibold
                    }
                  ]}>
                    {model.displayName}
                  </Text>
                  <Text style={[
                    styles.modelDescription,
                    { color: theme.colors.textMuted, fontFamily: theme.typography.weights.regular }
                  ]}>
                    {model.description}
                  </Text>
                  {model.contextLength && (
                    <Text style={[
                      styles.modelMeta,
                      { color: theme.colors.textMuted, fontFamily: theme.typography.weights.regular }
                    ]}>
                      Context: {model.contextLength.toLocaleString()} tokens
                    </Text>
                  )}
                </View>
                
                {selectedModel?.id === model.id && (
                  <Check color={theme.colors.primary} size={20} strokeWidth={2} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: theme.spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    headerIcon: {
      marginRight: theme.spacing.md,
    },
    headerTitle: {
      fontSize: theme.typography.sizes.lg,
      fontFamily: theme.typography.weights.bold,
      color: theme.colors.text,
      flex: 1,
    },
    closeButton: {
      padding: theme.spacing.sm,
    },
    content: {
      flex: 1,
    },
    scrollContent: {
      padding: theme.spacing.lg,
    },
    statusCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.lg,
      marginBottom: theme.spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    statusHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: theme.spacing.sm,
    },
    statusIcon: {
      marginRight: theme.spacing.sm,
    },
    statusText: {
      fontSize: theme.typography.sizes.md,
      fontFamily: theme.typography.weights.semibold,
    },
    statusSubtext: {
      fontSize: theme.typography.sizes.sm,
      fontFamily: theme.typography.weights.regular,
      color: theme.colors.textMuted,
    },
    section: {
      marginBottom: theme.spacing.xl,
    },
    sectionTitle: {
      fontSize: theme.typography.sizes.md,
      fontFamily: theme.typography.weights.semibold,
      color: theme.colors.text,
      marginBottom: theme.spacing.md,
    },
    providerSelector: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.lg,
    },
    providerButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      gap: theme.spacing.xs,
    },
    providerButtonActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    providerButtonText: {
      fontSize: theme.typography.sizes.sm,
      fontFamily: theme.typography.weights.medium,
      color: theme.colors.text,
    },
    providerButtonTextActive: {
      color: theme.colors.userText,
    },
    inputGroup: {
      marginBottom: theme.spacing.md,
    },
    label: {
      fontSize: theme.typography.sizes.sm,
      fontFamily: theme.typography.weights.medium,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xs,
    },
    input: {
      backgroundColor: theme.colors.inputBackground,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      fontSize: theme.typography.sizes.md,
      fontFamily: theme.typography.weights.regular,
      color: theme.colors.text,
    },
    inputFocused: {
      borderColor: theme.colors.primary,
    },
    description: {
      fontSize: theme.typography.sizes.xs,
      fontFamily: theme.typography.weights.regular,
      color: theme.colors.textMuted,
      marginTop: theme.spacing.xs,
      lineHeight: 16,
    },
    testButton: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      alignItems: 'center',
      marginTop: theme.spacing.md,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: theme.spacing.sm,
    },
    testButtonText: {
      fontSize: theme.typography.sizes.md,
      fontFamily: theme.typography.weights.semibold,
      color: theme.colors.text,
    },
    errorContainer: {
      backgroundColor: theme.colors.error + '10',
      borderWidth: 1,
      borderColor: theme.colors.error + '30',
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      marginTop: theme.spacing.md,
    },
    errorHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: theme.spacing.sm,
      gap: theme.spacing.xs,
    },
    errorTitle: {
      fontSize: theme.typography.sizes.sm,
      fontFamily: theme.typography.weights.semibold,
      color: theme.colors.error,
    },
    errorText: {
      fontSize: theme.typography.sizes.xs,
      fontFamily: theme.typography.weights.regular,
      color: theme.colors.error,
      lineHeight: 16,
    },
    modelSection: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.lg,
      marginBottom: theme.spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    modelSelectorButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.colors.inputBackground,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      marginTop: theme.spacing.sm,
    },
    modelSelectorText: {
      fontSize: theme.typography.sizes.md,
      fontFamily: theme.typography.weights.regular,
      color: theme.colors.text,
    },
    modelSelectorPlaceholder: {
      color: theme.colors.textMuted,
    },
    saveButton: {
      backgroundColor: theme.colors.primary,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      alignItems: 'center',
      marginTop: theme.spacing.lg,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: theme.spacing.sm,
    },
    saveButtonDisabled: {
      backgroundColor: theme.colors.border,
    },
    saveButtonText: {
      fontSize: theme.typography.sizes.md,
      fontFamily: theme.typography.weights.semibold,
      color: theme.colors.userText,
    },
    saveButtonTextDisabled: {
      color: theme.colors.textMuted,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modelSelectorModal: {
      width: '90%',
      maxHeight: '70%',
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      overflow: 'hidden',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: theme.spacing.lg,
      borderBottomWidth: 1,
    },
    modalTitle: {
      fontSize: theme.typography.sizes.lg,
    },
    modelsList: {
      maxHeight: 400,
    },
    modelItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    modelIcon: {
      width: 40,
      height: 40,
      borderRadius: theme.borderRadius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modelInfo: {
      flex: 1,
    },
    modelName: {
      fontSize: theme.typography.sizes.sm,
      marginBottom: 2,
    },
    modelDescription: {
      fontSize: theme.typography.sizes.xs,
      marginBottom: 2,
    },
    modelMeta: {
      fontSize: theme.typography.sizes.xs,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: theme.spacing.xxl,
    },
    loadingText: {
      fontSize: theme.typography.sizes.md,
      fontFamily: theme.typography.weights.medium,
      color: theme.colors.textMuted,
      marginTop: theme.spacing.md,
    },
  });

  if (!visible) return null;

  if (isLoading || !settings) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Loading configuration...</Text>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            {getProviderIcon(settings.apiProvider)}
          </View>
          <Text style={styles.headerTitle}>AI Connection</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <X color={theme.colors.text} size={24} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          {/* Connection Status */}
          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <View style={styles.statusIcon}>
                {connectionStatus === 'testing' ? (
                  <ActivityIndicator size="small" color={getStatusColor()} />
                ) : connectionStatus === 'success' ? (
                  <Check color={getStatusColor()} size={20} strokeWidth={2} />
                ) : connectionStatus === 'error' ? (
                  <AlertTriangle color={getStatusColor()} size={20} strokeWidth={2} />
                ) : (
                  <RefreshCw color={getStatusColor()} size={20} strokeWidth={2} />
                )}
              </View>
              <Text style={[styles.statusText, { color: getStatusColor() }]}>
                {getStatusText()}
              </Text>
            </View>
            <Text style={styles.statusSubtext}>
              {connectionStatus === 'success' 
                ? `${availableModels.length} models available`
                : 'Configure your AI provider below'
              }
            </Text>
          </View>

          {/* Provider Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select Provider</Text>
            <View style={styles.providerSelector}>
              {(['ollama', 'openai'] as const).map((provider) => (
                <TouchableOpacity
                  key={provider}
                  style={[
                    styles.providerButton,
                    settings.apiProvider === provider && styles.providerButtonActive
                  ]}
                  onPress={() => updateSetting('apiProvider', provider)}
                >
                  {getProviderIcon(provider)}
                  <Text style={[
                    styles.providerButtonText,
                    settings.apiProvider === provider && styles.providerButtonTextActive
                  ]}>
                    {provider.charAt(0).toUpperCase() + provider.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Connection Settings */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Connection Settings</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {settings.apiProvider === 'ollama' ? 'Server URL' : 'API Endpoint'}
              </Text>
              <TextInput
                style={styles.input}
                value={settings.endpoint}
                onChangeText={(text) => updateSetting('endpoint', text)}
                placeholder={getEndpointPlaceholder()}
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.description}>
                {getEndpointDescription()}
              </Text>
            </View>

            {settings.apiProvider !== 'ollama' && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>API Key</Text>
                <TextInput
                  style={styles.input}
                  value={settings.apiKey}
                  onChangeText={(text) => updateSetting('apiKey', text)}
                  placeholder={`Enter your ${settings.apiProvider.toUpperCase()} API key`}
                  placeholderTextColor={theme.colors.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.description}>
                  Your API key for {settings.apiProvider.toUpperCase()}. Stored securely on your device.
                </Text>
              </View>
            )}

            <TouchableOpacity 
              style={styles.testButton} 
              onPress={testConnection}
              disabled={isTesting}
            >
              {isTesting ? (
                <ActivityIndicator size="small" color={theme.colors.text} />
              ) : (
                <RefreshCw color={theme.colors.text} size={20} strokeWidth={2} />
              )}
              <Text style={styles.testButtonText}>
                {isTesting ? 'Testing Connection...' : 'Test Connection'}
              </Text>
            </TouchableOpacity>

            {connectionError && (
              <View style={styles.errorContainer}>
                <View style={styles.errorHeader}>
                  <AlertTriangle color={theme.colors.error} size={16} strokeWidth={2} />
                  <Text style={styles.errorTitle}>Connection Failed</Text>
                </View>
                <Text style={styles.errorText}>{connectionError}</Text>
              </View>
            )}
          </View>

          {/* Model Selection */}
          {connectionStatus === 'success' && availableModels.length > 0 && (
            <View style={styles.modelSection}>
              <Text style={styles.sectionTitle}>Select Model</Text>
              <Text style={styles.description}>
                Choose the AI model you want to use for conversations.
              </Text>
              
              <TouchableOpacity 
                style={styles.modelSelectorButton}
                onPress={() => setModelSelectorVisible(true)}
              >
                <Text style={[
                  styles.modelSelectorText,
                  !selectedModel && styles.modelSelectorPlaceholder
                ]}>
                  {selectedModel ? selectedModel.displayName : 'Select a model...'}
                </Text>
                <ChevronDown color={theme.colors.text} size={20} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          )}

          {/* Save Configuration */}
          <TouchableOpacity 
            style={[
              styles.saveButton,
              (connectionStatus !== 'success' || !selectedModel || isSaving) && styles.saveButtonDisabled
            ]}
            onPress={saveConfiguration}
            disabled={connectionStatus !== 'success' || !selectedModel || isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={theme.colors.userText} />
            ) : (
              <Check color={connectionStatus === 'success' && selectedModel ? theme.colors.userText : theme.colors.textMuted} size={20} strokeWidth={2} />
            )}
            <Text style={[
              styles.saveButtonText,
              (connectionStatus !== 'success' || !selectedModel || isSaving) && styles.saveButtonTextDisabled
            ]}>
              {isSaving ? 'Saving Configuration...' : 'Save Configuration'}
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Model Selector Modal */}
        {renderModelSelector()}
      </View>
    </Modal>
  );
}
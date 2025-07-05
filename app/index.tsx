import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Send, Bot, User, Loader, Menu, Plus, Settings, MessageCircle, X, ChevronDown, ChevronRight, Zap, Server, Palette, Bell, Volume2, Type, Sun, Moon, Monitor, Check, Trash2, MoveVertical as MoreVertical } from 'lucide-react-native';
import { useChat } from '@/features/chat/ChatContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Message } from '@/types/chat';
import ConnectionManager from '@/features/connection/ConnectionManager';
import { StorageManager } from '@/utils/storage'; // <-- Add this import
import Clipboard from '@react-native-clipboard/clipboard';
import Markdown from 'react-native-markdown-display';

const { width, height } = Dimensions.get('window');

type ActiveView = 'chat' | 'settings';

export default function MainScreen() {
  const { theme, isDark, themeMode, setThemeMode } = useTheme();
  const {
    currentSession,
    chatSessions,
    sendMessage,
    sendMessageStream, // <-- add
    streamingMessage,  // <-- add
    isLoading,
    activeModel,
    providers,
    createNewChat,
    switchToChat,
    deleteChat,
    refreshProviders,
    setActiveModel,
    refreshStats,
    clearAllDataAndReload, // <-- add this from context
  } = useChat();

  const [inputText, setInputText] = useState('');
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [connectionManagerVisible, setConnectionManagerVisible] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>('chat');
  const [showThemeOptions, setShowThemeOptions] = useState(false);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [modelSelectorVisible, setModelSelectorVisible] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Responsive sidebar width
  const [windowWidth, setWindowWidth] = useState(Dimensions.get('window').width);
  const isMobile = windowWidth < 600;
  // Only declare sidebarAnim ONCE!
  const sidebarAnim = useRef(new Animated.Value(-windowWidth * (windowWidth < 600 ? 1 : 0.8))).current;

  useEffect(() => {
    const onChange = ({ window }: { window: { width: number } }) => {
      setWindowWidth(window.width);
      // Reset sidebar position if width changes
      sidebarAnim.setValue(sidebarVisible ? 0 : -window.width * (window.width < 600 ? 1 : 0.8));
    };
    // Modern React Native: returns a subscription with remove()
    const subscription = Dimensions.addEventListener('change', onChange);
    return () => {
      subscription?.remove?.();
      // No need for removeEventListener (deprecated and not in type defs)
    };
  }, [sidebarAnim, sidebarVisible]);

  useEffect(() => {
    Animated.timing(sidebarAnim, {
      toValue: sidebarVisible ? 0 : -windowWidth * (isMobile ? 1 : 0.8),
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [sidebarVisible, windowWidth, isMobile, sidebarAnim]);

  useEffect(() => {
    // Show connection manager if no active model
    if (!activeModel && providers.length === 0) {
      setConnectionManagerVisible(true);
    }
  }, [activeModel, providers]);

  const toggleSidebar = () => {
    setSidebarVisible((prev) => !prev);
  };

  // Add a dummy refreshStats if not available from context
  // (If you have it in context, use that instead)
  const refreshStatsDummy = async () => {
    if (typeof (useChat as any).refreshStats === 'function') {
      await (useChat as any).refreshStats();
    }
  };

  // --- FIX: Use context for currentSession/messages, not local state ---
  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;

    if (!activeModel) {
      Alert.alert(
        'No Model Selected',
        'Please configure your AI connection first.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Configure', onPress: () => setConnectionManagerVisible(true) }
        ]
      );
      return;
    }

    const message = inputText.trim();
    setInputText('');

    // --- Use streaming for Ollama, fallback to normal for others ---
    if (activeModel.provider === 'ollama') {
      await sendMessageStream(message);
    } else {
      await sendMessage(message);
    }
  };

  // --- FIX: Remove setChatSessionsState and setCurrentSessionState, use context only ---
  const handleDeleteChat = async (sessionId: string) => {
    Alert.alert(
      'Delete Chat',
      'Are you sure you want to delete this chat? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingChatId(sessionId);
              await deleteChat(sessionId);
              setDeletingChatId(null);
              // Close sidebar after deletion to ensure UI updates
              setSidebarVisible(false);
            } catch (error) {
              setDeletingChatId(null);
              Alert.alert('Error', 'Failed to delete chat. Please try again.', [{ text: 'OK' }]);
            }
          }
        }
      ]
    );
  };

  // Add this function to clear all data (sessions, local storage, browser cache)
  const handleClearAllData = async () => {
    Alert.alert(
      'Clear All Data',
      'Are you sure you want to delete all chats and reset the app? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            setIsClearingAll(true);
            try {
              await clearAllDataAndReload(); // <-- use context method
              setTimeout(() => {
                setIsClearingAll(false);
                Alert.alert(
                  'All Data Cleared',
                  'All chats and settings have been deleted.',
                  [
                    {
                      text: 'OK',
                      onPress: () => {
                        setActiveView('chat');
                        setSidebarVisible(false);
                      }
                    }
                  ]
                );
              }, 500);
            } catch (e) {
              setIsClearingAll(false);
              Alert.alert('Error', 'Failed to clear all data');
            }
          }
        }
      ]
    );
  };

  const handleClearRecentChats = async () => {
    Alert.alert(
      'Clear Recent Chats',
      'Are you sure you want to delete all recent chats? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            setIsClearingAll(true);
            try {
              // Remove all chat sessions but keep settings and model
              await StorageManager.removeItem('chat_sessions');
              await refreshStats();
              setTimeout(() => {
                setIsClearingAll(false);
                Alert.alert(
                  'Recent Chats Cleared',
                  'All recent chats have been deleted.',
                  [
                    {
                      text: 'OK',
                      onPress: () => {
                        setActiveView('chat');
                        setSidebarVisible(false);
                      }
                    }
                  ]
                );
              }, 500);
            } catch (e) {
              setIsClearingAll(false);
              Alert.alert('Error', 'Failed to clear recent chats');
            }
          }
        }
      ]
    );
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInHours < 48) return 'Yesterday';
    return `${Math.floor(diffInHours / 24)} days ago`;
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'ollama':
        return <Server color={theme.colors.primary} size={16} strokeWidth={2} />;
      case 'openai':
        return <Zap color={theme.colors.success} size={16} strokeWidth={2} />;
      default:
        return <Server color={theme.colors.textMuted} size={16} strokeWidth={2} />;
    }
  };

  const getChatTitle = (session: any) => {
    if (!session || !session.messages || session.messages.length === 0) {
      return 'New Chat';
    }
    
    // Find the first user message
    const firstUserMessage = session.messages.find((msg: Message) => msg.sender === 'user');
    if (firstUserMessage) {
      // Truncate to first 30 characters and add ellipsis if longer
      const title = firstUserMessage.text.length > 30 
        ? firstUserMessage.text.substring(0, 30) + '...'
        : firstUserMessage.text;
      return title;
    }
    
    return session.title || 'New Chat';
  };

  // Utility: detect code blocks in markdown (simple version)
  function extractCodeBlocks(text: string) {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const blocks: { lang: string; code: string; start: number; end: number }[] = [];
    let match;
    while ((match = codeBlockRegex.exec(text))) {
      blocks.push({
        lang: match[1] || '',
        code: match[2],
        start: match.index,
        end: codeBlockRegex.lastIndex,
      });
    }
    return blocks;
  }

  // Custom renderer for code blocks with copy button
  function CodeBlockWithCopy({ children }: { children: string[] }) {
    const [copied, setCopied] = useState(false);
    const code = children.join('');
    return (
      <View style={{
        backgroundColor: '#18181b',
        borderRadius: 8,
        marginVertical: 8,
        padding: 8,
        position: 'relative',
      }}>
        <ScrollView
          horizontal
          style={{ maxWidth: '100%' }}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <Text
            selectable
            style={{
              color: '#f1f5f9',
              fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
              fontSize: 14,
              minWidth: 200,
            }}
          >
            {code}
          </Text>
        </ScrollView>
        <View style={{
          position: 'absolute',
          top: 4,
          right: 4,
          flexDirection: 'row',
          gap: 8,
        }}>
          <TouchableOpacity
            onPress={async () => {
              Clipboard.setString(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            style={{
              backgroundColor: '#27272a',
              borderRadius: 4,
              padding: 4,
              marginRight: 4,
            }}
          >
            <Text style={{ color: '#f1f5f9', fontSize: 12 }}>
              {copied ? 'Copied' : 'Copy'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Render markdown with improved spacing (but without wordBreak)
  function renderRichMessage(message: string) {
    return (
      <Markdown
        style={{
          body: { color: '#f1f5f9', fontSize: 15, marginVertical: 4, paddingVertical: 2, lineHeight: 22 },
          paragraph: { marginBottom: 10, marginTop: 0, lineHeight: 22 },
          code_inline: {
            backgroundColor: '#23272e',
            color: '#f1f5f9',
            borderRadius: 4,
            paddingHorizontal: 4,
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
          },
          link: { color: '#60a5fa', textDecorationLine: 'underline' },
          table: { borderWidth: 1, borderColor: '#444', borderRadius: 4 },
          th: { backgroundColor: '#23272e', color: '#f1f5f9', padding: 4 },
          tr: { borderBottomWidth: 1, borderColor: '#444' },
          td: { color: '#f1f5f9', padding: 4 },
          bullet_list: { color: '#f1f5f9' },
          ordered_list: { color: '#f1f5f9' },
          list_item: { color: '#f1f5f9' },
          fence: {
            backgroundColor: '#18181b',
            borderRadius: 8,
            marginVertical: 8,
            padding: 8,
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
            fontSize: 14,
            color: '#f1f5f9',
            minWidth: 200,
            lineHeight: 20,
          },
          heading1: { fontSize: 22, fontWeight: 'bold', marginVertical: 8 },
          heading2: { fontSize: 18, fontWeight: 'bold', marginVertical: 6 },
          heading3: { fontSize: 16, fontWeight: 'bold', marginVertical: 4 },
        }}
        rules={{
          fence: (node, children, parent, styles) => (
            <CodeBlockWithCopy key={node.key}>{[node.content]}</CodeBlockWithCopy>
          ),
        }}
      >
        {message}
      </Markdown>
    );
  }

  // Update renderMessage to use renderRichMessage for assistant
  const renderMessage = (message: Message) => {
    const isUser = message.sender === 'user';

    return (
      <View
        key={message.id}
        style={[
          styles.messageContainer,
          isUser ? styles.userMessageContainer : styles.assistantMessageContainer,
        ]}
      >
        <View style={[
          styles.avatarContainer,
          isUser
            ? [styles.userAvatar, { backgroundColor: theme.colors.primary }]
            : [styles.assistantAvatar, { backgroundColor: theme.colors.secondary }]
        ]}>
          {isUser ? (
            <User color={theme.colors.userText} size={16} strokeWidth={2} />
          ) : (
            <Bot color={theme.colors.userText} size={16} strokeWidth={2} />
          )}
        </View>

        <View style={[
          styles.messageBubble,
          isUser
            ? [styles.userBubble, { backgroundColor: theme.colors.userBubble }]
            : [styles.assistantBubble, { backgroundColor: theme.colors.assistantBubble, borderColor: theme.colors.border }],
          message.error && { backgroundColor: theme.colors.error + '20', borderColor: theme.colors.error }
        ]}>
          {isUser ? (
            <Text style={[
              styles.messageText,
              styles.userMessageText,
              { color: theme.colors.userText, fontFamily: theme.typography.weights.regular, fontSize: theme.typography.sizes.md }
            ]}>
              {message.text}
            </Text>
          ) : (
            renderRichMessage(message.text)
          )}
          <View style={styles.messageFooter}>
            <Text style={[
              styles.timestamp,
              {
                color: isUser ? theme.colors.userText + '80' : theme.colors.textMuted,
                fontFamily: theme.typography.weights.regular,
                fontSize: theme.typography.sizes.xs
              }
            ]}>
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  // Wrapper component to allow useState in renderRichMessage
  function RichMessageWrapper({ message }: { message: string }) {
    const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

    // Pass copiedIdx and setCopiedIdx to renderRichMessage
    return renderRichMessageWithCopy(message, copiedIdx, setCopiedIdx);
  }

  // Helper to allow passing state to renderRichMessage
  function renderRichMessageWithCopy(
    message: string,
    copiedIdx: number | null,
    setCopiedIdx: (idx: number | null) => void
  ) {
    const codeBlocks = extractCodeBlocks(message);
    if (codeBlocks.length === 0) {
      return <Text>{message}</Text>;
    }

    const elements: React.ReactNode[] = [];
    let lastIndex = 0;

    codeBlocks.forEach((block, idx) => {
      if (block.start > lastIndex) {
        elements.push(
          <Text key={`text-${idx}`}>
            {message.slice(lastIndex, block.start)}
          </Text>
        );
      }

      elements.push(
        <View key={`codeblock-${idx}`} style={{
          backgroundColor: '#18181b',
          borderRadius: 8,
          marginVertical: 8,
          padding: 8,
          position: 'relative',
        }}>
          <ScrollView
            horizontal
            style={{ maxWidth: '100%' }}
            contentContainerStyle={{ flexGrow: 1 }}
          >
            <Text
              selectable
              style={{
                color: '#f1f5f9',
                fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                fontSize: 14,
                minWidth: 200,
              }}
            >
              {block.code}
            </Text>
          </ScrollView>
          <View style={{
            position: 'absolute',
            top: 4,
            right: 4,
            flexDirection: 'row',
            gap: 8,
          }}>
            <TouchableOpacity
              onPress={async () => {
                Clipboard.setString(block.code);
                setCopiedIdx(idx);
                setTimeout(() => setCopiedIdx(null), 1200);
              }}
              style={{
                backgroundColor: '#27272a',
                borderRadius: 4,
                padding: 4,
                marginRight: 4,
              }}
            >
              <Text style={{ color: '#f1f5f9', fontSize: 12 }}>
                {copiedIdx === idx ? 'Copied' : 'Copy'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
      lastIndex = block.end;
    });

    // Add any remaining text after last code block
    if (lastIndex < message.length) {
      elements.push(
        <Text key={`text-end`}>
          {message.slice(lastIndex)}
        </Text>
      );
    }

    return <>{elements}</>;
  }

  const renderChatView = () => (
    <>
      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Always use local state if available, fallback to context */}
        {(currentSession?.messages)?.map(renderMessage)}

        {/* Streaming assistant message */}
        {streamingMessage !== null && (
          <View style={[styles.messageContainer, styles.assistantMessageContainer]}>
            <View style={[styles.avatarContainer, styles.assistantAvatar, { backgroundColor: theme.colors.secondary }]}>
              <Bot color={theme.colors.userText} size={16} strokeWidth={2} />
            </View>
            <View style={[styles.messageBubble, styles.assistantBubble, { backgroundColor: theme.colors.assistantBubble, borderColor: theme.colors.border }]}>
              {renderRichMessage(streamingMessage)}
              <View style={styles.messageFooter}>
                <Text style={[
                  styles.timestamp,
                  { color: theme.colors.textMuted, fontFamily: theme.typography.weights.regular, fontSize: theme.typography.sizes.xs }
                ]}>
                  ...
                </Text>
              </View>
            </View>
          </View>
        )}

        {isLoading && streamingMessage === null && (
          <View style={[styles.messageContainer, styles.assistantMessageContainer]}>
            <View style={[styles.avatarContainer, styles.assistantAvatar, { backgroundColor: theme.colors.secondary }]}>
              <Bot color={theme.colors.userText} size={16} strokeWidth={2} />
            </View>
            <View style={[styles.messageBubble, styles.assistantBubble, { backgroundColor: theme.colors.assistantBubble, borderColor: theme.colors.border }]}>
              <View style={styles.loadingContainer}>
                <Loader color={theme.colors.textMuted} size={16} strokeWidth={2} />
                <Text style={styles.loadingText}>Thinking...</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={activeModel ? "Type your message..." : "Configure AI connection first..."}
            placeholderTextColor={theme.colors.textMuted}
            multiline
            maxLength={1000}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            editable={!!activeModel}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || isLoading || !activeModel) && styles.sendButtonDisabled
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || isLoading || !activeModel}
          >
            <Send 
              color={(!inputText.trim() || isLoading || !activeModel) ? theme.colors.textMuted : theme.colors.userText} 
              size={20} 
              strokeWidth={2} 
            />
          </TouchableOpacity>
        </View>
      </View>
    </>
  );

  const SettingItem = ({ 
    icon, 
    title, 
    subtitle, 
    onPress, 
    rightElement,
    showChevron = true 
  }: {
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    rightElement?: React.ReactNode;
    showChevron?: boolean;
  }) => (
    <TouchableOpacity 
      style={[styles.settingItem, { backgroundColor: theme.colors.surface }]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.settingIcon, { backgroundColor: theme.colors.surfaceVariant }]}>
        {icon}
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, { color: theme.colors.text }]}>{title}</Text>
        {subtitle && (
          <Text style={[styles.settingSubtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
        )}
      </View>
      {rightElement || (showChevron && (
        <ChevronRight color={theme.colors.textMuted} size={20} strokeWidth={2} />
      ))}
    </TouchableOpacity>
  );

  const ThemeOption = ({ 
    icon, 
    title, 
    value, 
    isSelected 
  }: {
    icon: React.ReactNode;
    title: string;
    value: 'light' | 'dark' | 'system';
    isSelected: boolean;
  }) => (
    <TouchableOpacity 
      style={[
        styles.themeOption, 
        { 
          backgroundColor: theme.colors.surface,
          borderColor: isSelected ? theme.colors.primary : theme.colors.border
        }
      ]}
      onPress={() => {
        setThemeMode(value);
        setShowThemeOptions(false);
      }}
    >
      <View style={[styles.themeIcon, { backgroundColor: theme.colors.surfaceVariant }]}>
        {icon}
      </View>
      <Text style={[styles.themeTitle, { color: theme.colors.text }]}>{title}</Text>
      {isSelected && (
        <View style={[styles.checkIcon, { backgroundColor: theme.colors.primary }]}>
          <Check color={theme.colors.userText} size={16} strokeWidth={2} />
        </View>
      )}
    </TouchableOpacity>
  );

  const renderSettingsView = () => (
    <ScrollView 
      style={styles.viewContainer}
      contentContainerStyle={styles.viewContent}
      showsVerticalScrollIndicator={false}
    >
      {/* AI & Models */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI & Models</Text>
        
        <SettingItem
          icon={<Bot color={theme.colors.primary} size={20} strokeWidth={2} />}
          title="AI Connection"
          subtitle="Configure your AI providers and models"
          onPress={() => setConnectionManagerVisible(true)}
        />
      </View>

      {/* Appearance */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        
        <SettingItem
          icon={<Palette color={theme.colors.secondary} size={20} strokeWidth={2} />}
          title="Theme"
          subtitle={`Currently using ${themeMode} theme`}
          onPress={() => setShowThemeOptions(!showThemeOptions)}
          showChevron={false}
          rightElement={
            <ChevronDown 
              color={theme.colors.textMuted} 
              size={20} 
              strokeWidth={2}
              style={{ transform: [{ rotate: showThemeOptions ? '180deg' : '0deg' }] }}
            />
          }
        />
        
        {showThemeOptions && (
          <View style={styles.themeOptionsContainer}>
            <ThemeOption
              icon={<Sun color={theme.colors.warning} size={16} strokeWidth={2} />}
              title="Light"
              value="light"
              isSelected={themeMode === 'light'}
            />
            <ThemeOption
              icon={<Moon color={theme.colors.info} size={16} strokeWidth={2} />}
              title="Dark"
              value="dark"
              isSelected={themeMode === 'dark'}
            />
            <ThemeOption
              icon={<Monitor color={theme.colors.textMuted} size={16} strokeWidth={2} />}
              title="System"
              value="system"
              isSelected={themeMode === 'system'}
            />
          </View>
        )}

        <SettingItem
          icon={<Type color={theme.colors.success} size={20} strokeWidth={2} />}
          title="Font Size"
          subtitle="Adjust text size for better readability"
          onPress={() => {}}
        />
      </View>

      {/* Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        
        <SettingItem
          icon={<Bell color={theme.colors.warning} size={20} strokeWidth={2} />}
          title="Push Notifications"
          subtitle="Get notified about important updates"
          showChevron={false}
        />
        
        <SettingItem
          icon={<Volume2 color={theme.colors.info} size={20} strokeWidth={2} />}
          title="Sound Effects"
          subtitle="Play sounds for message notifications"
          showChevron={false}
        />
      </View>

      {/* Danger Zone */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.error }]}>Danger Zone</Text>
        <TouchableOpacity
          style={[
            styles.clearAllButton,
            isClearingAll && styles.clearAllButtonDisabled
          ]}
          onPress={handleClearRecentChats}
          disabled={isClearingAll}
        >
          <Trash2 color={theme.colors.userText} size={18} strokeWidth={2} />
          <Text style={styles.clearAllButtonText}>
            {isClearingAll ? 'Clearing recent chats...' : 'Clear Recent Chats'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.clearAllDescription}>
          This will delete all recent chats. This action cannot be undone.
        </Text>
      </View>
    </ScrollView>
  );

  const renderSidebar = () => (
    <Animated.View 
      style={[
        styles.sidebar,
        isMobile
          ? { left: 0, right: 0, width: windowWidth, borderRightWidth: 0, borderBottomWidth: 1, borderBottomColor: theme.colors.border }
          : { left: 0, width: windowWidth * 0.8, borderRightWidth: 1 },
        {
          backgroundColor: theme.colors.surface,
          borderRightColor: theme.colors.border,
          transform: [{ translateX: sidebarAnim }],
          position: 'absolute',
          top: 0,
          bottom: 0,
          zIndex: 1000,
        }
      ]}
      pointerEvents={sidebarVisible ? 'auto' : 'none'}
    >
      <View style={[styles.sidebarHeader, { borderBottomColor: theme.colors.border }]}>
        <Text style={[
          styles.sidebarTitle,
          { color: theme.colors.text, fontFamily: theme.typography.weights.bold }
        ]}>
          AI Chat
        </Text>
        <TouchableOpacity onPress={toggleSidebar}>
          <X color={theme.colors.text} size={24} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* Chat Section */}
      <View style={styles.chatSection}>
        {/* New Chat Button - Improved Design */}
        <View style={styles.newChatContainer}>
          <TouchableOpacity 
            style={[styles.newChatButton, { backgroundColor: theme.colors.primary }]}
            onPress={async () => {
              if (!activeModel) {
                setConnectionManagerVisible(true);
                toggleSidebar();
                return;
              }
              await createNewChat();
              toggleSidebar();
            }}
          >
            <Plus color={theme.colors.userText} size={24} strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={[
            styles.newChatLabel,
            { color: theme.colors.text, fontFamily: theme.typography.weights.medium }
          ]}>
            New Chat
          </Text>
        </View>

        <ScrollView style={styles.chatsList} showsVerticalScrollIndicator={false}>
          <Text style={[
            styles.chatsListTitle,
            { color: theme.colors.textMuted, fontFamily: theme.typography.weights.medium }
          ]}>
            Recent Chats ({chatSessions.length})
          </Text>
          
          {chatSessions.slice(0, 20).map((session) => (
            <View key={session.id} style={styles.chatItemWrapper}>
              <TouchableOpacity
                style={[
                  styles.chatItem,
                  session.isActive && { backgroundColor: theme.colors.primaryLight + '20' }
                ]}
                onPress={async () => {
                  // FIX 3: Sync session and chat list after switching
                  await switchToChat(session.id);
                  // In sidebar chat list, after switchToChat, do not update local state, just rely on context
                  setActiveView('chat');
                  toggleSidebar();
                }}
              >
                <MessageCircle 
                  color={session.isActive ? theme.colors.primary : theme.colors.textMuted} 
                  size={16} 
                  strokeWidth={2} 
                />
                <View style={styles.chatItemContent}>
                  <Text 
                    style={[
                      styles.chatItemTitle,
                      { 
                        color: session.isActive ? theme.colors.primary : theme.colors.text,
                        fontFamily: theme.typography.weights.medium
                      }
                    ]}
                    numberOfLines={1}
                  >
                    {getChatTitle(session)}
                  </Text>
                  <Text style={[
                    styles.chatItemTime,
                    { color: theme.colors.textMuted, fontFamily: theme.typography.weights.regular }
                  ]}>
                    {formatTimestamp(session.updatedAt)}
                  </Text>
                </View>
              </TouchableOpacity>
              
              {/* Delete Button */}
              <TouchableOpacity
                style={[
                  styles.deleteButton, 
                  { 
                    backgroundColor: theme.colors.error + '20',
                    opacity: deletingChatId === session.id ? 0.5 : 1
                  }
                ]}
                onPress={() => handleDeleteChat(session.id)}
                disabled={deletingChatId === session.id}
              >
                {deletingChatId === session.id ? (
                  <Loader color={theme.colors.error} size={16} strokeWidth={2} />
                ) : (
                  <Trash2 color={theme.colors.error} size={16} strokeWidth={2} />
                )}
              </TouchableOpacity>
            </View>
          ))}
          
          {chatSessions.length === 0 && (
            <View style={styles.emptyChatsList}>
              <Text style={[
                styles.emptyChatText,
                { color: theme.colors.textMuted, fontFamily: theme.typography.weights.regular }
              ]}>
                No chats yet. Start a new conversation!
              </Text>
            </View>
          )}
        </ScrollView>
      </View>

      {/* Settings at Bottom */}
      <View style={[styles.sidebarFooter, { borderTopColor: theme.colors.border }]}>
        <TouchableOpacity 
          style={[
            styles.settingsNavItem,
            activeView === 'settings' && { backgroundColor: theme.colors.primary + '20' }
          ]}
          onPress={() => {
            setActiveView('settings');
            toggleSidebar();
          }}
        >
          <Settings 
            color={activeView === 'settings' ? theme.colors.primary : theme.colors.textMuted} 
            size={20} 
            strokeWidth={2} 
          />
          <Text style={[
            styles.settingsNavText,
            { 
              color: activeView === 'settings' ? theme.colors.primary : theme.colors.text,
              fontFamily: theme.typography.weights.medium
            }
          ]}>
            Settings
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  // Model selector modal
  const renderModelSelector = () => {
    // Flatten all models from all providers
    const allModels = providers.flatMap(p => p.models.map(m => ({ ...m, providerName: p.name })));
    return (
      <Modal
        visible={modelSelectorVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModelSelectorVisible(false)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          activeOpacity={1}
          onPress={() => setModelSelectorVisible(false)}
        >
          <View style={{
            width: '90%',
            maxHeight: '70%',
            backgroundColor: theme.colors.surface,
            borderRadius: theme.borderRadius.lg,
            borderWidth: 1,
            borderColor: theme.colors.border,
            overflow: 'hidden',
          }}>
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: theme.spacing.lg,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
            }}>
              <Text style={{
                fontSize: theme.typography.sizes.lg,
                color: theme.colors.text,
                fontFamily: theme.typography.weights.bold,
              }}>
                Select Model
              </Text>
              <TouchableOpacity onPress={() => setModelSelectorVisible(false)}>
                <X color={theme.colors.text} size={24} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {allModels.map(model => (
                <TouchableOpacity
                  key={model.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: theme.spacing.md,
                    backgroundColor: activeModel?.id === model.id ? theme.colors.primary + '20' : undefined,
                  }}
                  onPress={async () => {
                    await setActiveModel(model);
                    setModelSelectorVisible(false);
                  }}
                >
                  <View style={{
                    width: 36,
                    height: 36,
                    borderRadius: theme.borderRadius.md,
                    justifyContent: 'center',
                    alignItems: 'center',
                    backgroundColor: theme.colors.surfaceVariant,
                    marginRight: theme.spacing.md,
                  }}>
                    {getProviderIcon(model.provider)}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      color: activeModel?.id === model.id ? theme.colors.primary : theme.colors.text,
                      fontFamily: theme.typography.weights.semibold,
                      fontSize: theme.typography.sizes.md,
                    }}>
                      {model.displayName}
                    </Text>
                    <Text style={{
                      color: theme.colors.textMuted,
                      fontFamily: theme.typography.weights.regular,
                      fontSize: theme.typography.sizes.xs,
                    }}>
                      {model.description}
                    </Text>
                    {model.contextLength && (
                      <Text style={{
                        color: theme.colors.textMuted,
                        fontFamily: theme.typography.weights.regular,
                        fontSize: theme.typography.sizes.xs,
                      }}>
                        Context: {model.contextLength.toLocaleString()} tokens
                      </Text>
                    )}
                  </View>
                  {activeModel?.id === model.id && (
                    <Check color={theme.colors.primary} size={20} strokeWidth={2} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  const getViewTitle = () => {
    switch (activeView) {
      case 'chat':
        return getChatTitle(currentSession);
      case 'settings':
        return 'Settings';
      default:
        return 'AI Chat';
    }
  };

  const getViewSubtitle = () => {
    switch (activeView) {
      case 'settings':
        return 'Customize your AI chat experience';
      default:
        return null;
    }
  };

  const renderMainContent = () => {
    switch (activeView) {
      case 'chat':
        return renderChatView();
      case 'settings':
        return renderSettingsView();
      default:
        return renderChatView();
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: theme.spacing.lg,
      paddingBottom: theme.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.headerBackground,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    menuButton: {
      marginRight: theme.spacing.md,
    },
    headerContent: {
      flex: 1,
    },
    headerTitle: {
      fontSize: theme.typography.sizes.lg,
      fontFamily: theme.typography.weights.bold,
      color: theme.colors.text,
    },
    headerSubtitle: {
      fontSize: theme.typography.sizes.sm,
      fontFamily: theme.typography.weights.regular,
      color: theme.colors.textMuted,
      marginTop: 2,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    modelSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: theme.spacing.xs,
    },
    modelSelectorText: {
      fontSize: theme.typography.sizes.sm,
      fontFamily: theme.typography.weights.medium,
      color: theme.colors.text,
      marginRight: theme.spacing.xs,
    },
    newChatHeaderButton: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.borderRadius.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    newChatHeaderButtonText: {
      fontSize: theme.typography.sizes.sm,
      fontFamily: theme.typography.weights.semibold,
      color: theme.colors.userText,
    },
    closeSettingsButton: {
      padding: theme.spacing.sm,
    },
    keyboardAvoid: {
      flex: 1,
    },
    messagesContainer: {
      flex: 1,
    },
    messagesContent: {
      padding: theme.spacing.md,
      paddingBottom: theme.spacing.sm,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: theme.spacing.xxl * 2,
    },
    emptyTitle: {
      fontSize: theme.typography.sizes.xl,
      fontFamily: theme.typography.weights.bold,
      color: theme.colors.text,
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    emptyDescription: {
      fontSize: theme.typography.sizes.md,
      fontFamily: theme.typography.weights.regular,
      color: theme.colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: theme.spacing.xl,
      lineHeight: 22,
      marginBottom: theme.spacing.lg,
    },
    setupButton: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.borderRadius.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    setupButtonText: {
      fontSize: theme.typography.sizes.md,
      fontFamily: theme.typography.weights.semibold,
      color: theme.colors.userText,
    },
    messageContainer: {
      flexDirection: 'row',
      marginBottom: theme.spacing.md,
      alignItems: 'flex-end',
    },
    userMessageContainer: {
      justifyContent: 'flex-end',
    },
    assistantMessageContainer: {
      justifyContent: 'flex-start',
    },
    avatarContainer: {
      width: 32,
      height: 32,
      borderRadius: theme.borderRadius.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginHorizontal: theme.spacing.sm,
    },
    userAvatar: {},
    assistantAvatar: {},
    messageBubble: {
      maxWidth: '75%',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm + 2,
      borderRadius: theme.borderRadius.lg,
    },
    userBubble: {
      borderBottomRightRadius: theme.spacing.xs,
    },
    assistantBubble: {
      borderWidth: 1,
      borderBottomLeftRadius: theme.spacing.xs,
    },
    messageText: {
      lineHeight: 24,
    },
    userMessageText: {},
    assistantMessageText: {},
    messageFooter: {
      marginTop: theme.spacing.xs,
    },
    timestamp: {},
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    loadingText: {
      fontSize: theme.typography.sizes.sm,
      fontFamily: theme.typography.weights.regular,
      color: theme.colors.textMuted,
    },
    inputContainer: {
      padding: theme.spacing.md,
      paddingTop: theme.spacing.sm,
      backgroundColor: theme.colors.headerBackground,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      backgroundColor: theme.colors.inputBackground,
      borderRadius: theme.borderRadius.xl,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    textInput: {
      flex: 1,
      fontSize: theme.typography.sizes.md,
      fontFamily: theme.typography.weights.regular,
      color: theme.colors.text,
      maxHeight: 100,
      paddingVertical: theme.spacing.sm,
    },
    sendButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.borderRadius.full,
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: theme.spacing.sm,
    },
    sendButtonDisabled: {
      backgroundColor: theme.colors.border,
    },
    sidebar: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      zIndex: 1000,
      // width is set in sidebarMobile/sidebarDesktop
    },
    sidebarDesktop: {
      left: 0,
      width: width * 0.8,
      borderRightWidth: 1,
    },
    sidebarMobile: {
      left: 0,
      right: 0,
      width: width,
      borderRightWidth: 0,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      // Optionally, you can add borderRadius or shadow for mobile
    },
    sidebarHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: theme.spacing.lg,
      borderBottomWidth: 1,
    },
    sidebarTitle: {
      fontSize: theme.typography.sizes.lg,
    },
    chatSection: {
      flex: 1,
    },
    newChatContainer: {
      alignItems: 'center',
      paddingVertical: theme.spacing.lg,
      paddingHorizontal: theme.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      marginBottom: theme.spacing.sm,
    },
    newChatButton: {
      width: 56,
      height: 56,
      borderRadius: theme.borderRadius.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: theme.spacing.sm,
      shadowColor: theme.colors.primary,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    newChatLabel: {
      fontSize: theme.typography.sizes.sm,
      textAlign: 'center',
    },
    chatsList: {
      flex: 1,
      paddingHorizontal: theme.spacing.md,
    },
    chatsListTitle: {
      fontSize: theme.typography.sizes.sm,
      marginBottom: theme.spacing.md,
      marginTop: theme.spacing.sm,
      paddingHorizontal: theme.spacing.sm,
    },
    sectionTitle: {
      fontSize: theme.typography.sizes.md,
      fontFamily: theme.typography.weights.semibold,
      color: theme.colors.text,
      marginBottom: theme.spacing.md,
    },
    chatItemWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: theme.spacing.xs,
    },
    chatItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      padding: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      gap: theme.spacing.sm,
    },
    chatItemContent: {
      flex: 1,
    },
    chatItemTitle: {
      fontSize: theme.typography.sizes.sm,
      marginBottom: 2,
    },
    chatItemTime: {
      fontSize: theme.typography.sizes.xs,
    },
    deleteButton: {
      padding: theme.spacing.sm,
      borderRadius: theme.borderRadius.md,
      marginLeft: theme.spacing.xs,
      minWidth: 32,
      minHeight: 32,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyChatsList: {
      padding: theme.spacing.lg,
      alignItems: 'center',
    },
    emptyChatText: {
      fontSize: theme.typography.sizes.sm,
      textAlign: 'center',
    },
    sidebarFooter: {
      borderTopWidth: 1,
      padding: theme.spacing.md,
    },
    settingsNavItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      gap: theme.spacing.sm,
    },
    settingsNavText: {
      fontSize: theme.typography.sizes.md,
    },
    viewContainer: {
      flex: 1,
    },
    viewContent: {
      padding: theme.spacing.lg,
    },
    section: {
      marginBottom: theme.spacing.xl,
    },
    settingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: theme.spacing.lg,
      borderRadius: theme.borderRadius.lg,
      marginBottom: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    settingIcon: {
      width: 40,
      height: 40,
      borderRadius: theme.borderRadius.md,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: theme.spacing.md,
    },
    settingContent: {
      flex: 1,
    },
    settingTitle: {
      fontSize: theme.typography.sizes.md,
      fontFamily: theme.typography.weights.medium,
      marginBottom: 2,
    },
    settingSubtitle: {
      fontSize: theme.typography.sizes.sm,
      fontFamily: theme.typography.weights.regular,
      lineHeight: 18,
    },
    themeOptionsContainer: {
      marginTop: theme.spacing.sm,
      gap: theme.spacing.sm,
    },
    themeOption: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      borderWidth: 2,
      marginLeft: theme.spacing.lg,
    },
    themeIcon: {
      width: 32,
      height: 32,
      borderRadius: theme.borderRadius.sm,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: theme.spacing.md,
    },
    themeTitle: {
      fontSize: theme.typography.sizes.sm,
      fontFamily: theme.typography.weights.medium,
      flex: 1,
    },
    checkIcon: {
      width: 24,
      height: 24,
      borderRadius: theme.borderRadius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    clearAllButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#ef4444',
      padding: 14,
      borderRadius: 10,
      marginTop: 8,
      marginBottom: 4,
      gap: 8,
      opacity: 1,
    },
    clearAllButtonDisabled: {
      opacity: 0.6,
    },
    clearAllButtonText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 16,
    },
    clearAllDescription: {
      color: '#ef4444',
      fontSize: 12,
      marginTop: 4,
      fontStyle: 'italic',
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.menuButton} onPress={toggleSidebar}>
            <Menu color={theme.colors.text} size={24} strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>
              {getViewTitle()}
            </Text>
            {getViewSubtitle() && (
              <Text style={styles.headerSubtitle}>
                {getViewSubtitle()}
              </Text>
            )}
          </View>
        </View>
        
        <View style={styles.headerActions}>
          {activeView === 'chat' && (
            <>
              <TouchableOpacity 
                style={styles.newChatHeaderButton}
                onPress={createNewChat}
              >
                <Plus color={theme.colors.userText} size={16} strokeWidth={2} />
                <Text style={styles.newChatHeaderButtonText}>New</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.modelSelector}
                onPress={() => setModelSelectorVisible(true)} // <-- open model selector modal
              >
                {activeModel && getProviderIcon(activeModel.provider)}
                <Text style={styles.modelSelectorText}>
                  {activeModel ? activeModel.displayName : 'No Model'}
                </Text>
                <ChevronDown color={theme.colors.text} size={16} strokeWidth={2} />
              </TouchableOpacity>
            </>
          )}
          
          {activeView === 'settings' && (
            <TouchableOpacity 
              style={styles.closeSettingsButton}
              onPress={() => setActiveView('chat')}
            >
              <X color={theme.colors.text} size={24} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <KeyboardAvoidingView 
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {renderMainContent()}
      </KeyboardAvoidingView>

      {/* Sidebar */}
      {renderSidebar()}
      
      {/* Sidebar Overlay */}
      {sidebarVisible && (
        <TouchableOpacity 
          style={[
            StyleSheet.absoluteFillObject,
            isMobile
              ? { top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }
              : { left: windowWidth * 0.8, right: 0, top: 0, bottom: 0, zIndex: 999 }
          ]}
          activeOpacity={1}
          onPress={() => setSidebarVisible(false)}
        />
      )}

      {/* Model Selector Modal */}
      {renderModelSelector()}

      {/* Connection Manager */}
      <ConnectionManager
        visible={connectionManagerVisible}
        onClose={() => setConnectionManagerVisible(false)}
        onConnectionSuccess={refreshProviders}
      />
    </SafeAreaView>
  );
}
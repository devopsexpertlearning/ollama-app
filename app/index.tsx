import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Send, Plus, Settings, MessageSquare, Trash2, CreditCard as Edit3, Check, X, Bot, User, MoveVertical as MoreVertical, RefreshCw, Menu, ChevronLeft } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useChat } from '@/features/chat/ChatContext';
import ConnectionManager from '@/components/ConnectionManager';
import { Message } from '@/types/chat';

export default function ChatScreen() {
  const { theme } = useTheme();
  const {
    chatSessions,
    currentSession,
    createNewChat,
    switchToChat,
    deleteChat,
    sendMessage,
    sendMessageStream,
    streamingMessage,
    isLoading,
    activeModel,
    isConnected,
    connectionError,
    updateChatTitle,
  } = useChat();

  const [inputText, setInputText] = useState('');
  const [showConnectionManager, setShowConnectionManager] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  
  const scrollViewRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [currentSession?.messages, streamingMessage]);

  // Show connection manager if not connected and no active model
  useEffect(() => {
    if (!isConnected && !activeModel && chatSessions.length === 0) {
      setShowConnectionManager(true);
    }
  }, [isConnected, activeModel, chatSessions.length]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const message = inputText.trim();
    setInputText('');

    try {
      // Use streaming if available, otherwise fall back to regular send
      if (activeModel?.provider === 'ollama') {
        await sendMessageStream(message);
      } else {
        await sendMessage(message);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to send message');
    }
  };

  const handleCreateNewChat = async () => {
    try {
      await createNewChat();
      setShowSidebar(false);
    } catch (error) {
      console.error('Failed to create new chat:', error);
      if (error instanceof Error && error.message.includes('No AI models available')) {
        setShowConnectionManager(true);
      } else {
        Alert.alert('Error', error instanceof Error ? error.message : 'Failed to create new chat');
      }
    }
  };

  const handleSwitchChat = async (sessionId: string) => {
    try {
      await switchToChat(sessionId);
      setShowSidebar(false);
    } catch (error) {
      console.error('Failed to switch chat:', error);
      Alert.alert('Error', 'Failed to switch to chat');
    }
  };

  const handleDeleteChat = async (sessionId: string, event?: any) => {
    // Prevent event bubbling to avoid triggering chat switch
    if (event) {
      event.stopPropagation();
    }

    try {
      Alert.alert(
        'Delete Chat',
        'Are you sure you want to delete this chat? This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              console.log('[ChatScreen] Deleting chat:', sessionId);
              await deleteChat(sessionId);
              console.log('[ChatScreen] Chat deleted successfully');
            },
          },
        ]
      );
    } catch (error) {
      console.error('Failed to delete chat:', error);
      Alert.alert('Error', 'Failed to delete chat');
    }
  };

  const handleEditChatTitle = (sessionId: string, currentTitle: string, event?: any) => {
    if (event) {
      event.stopPropagation();
    }
    setEditingChatId(sessionId);
    setEditingTitle(currentTitle);
  };

  const handleSaveChatTitle = async () => {
    if (!editingChatId || !editingTitle.trim()) return;

    try {
      await updateChatTitle(editingChatId, editingTitle.trim());
      setEditingChatId(null);
      setEditingTitle('');
    } catch (error) {
      console.error('Failed to update chat title:', error);
      Alert.alert('Error', 'Failed to update chat title');
    }
  };

  const handleCancelEditTitle = () => {
    setEditingChatId(null);
    setEditingTitle('');
  };

  const renderMessage = (message: Message, index: number) => {
    const isUser = message.sender === 'user';
    const isError = message.error;

    return (
      <View
        key={message.id}
        style={[
          styles.messageContainer,
          isUser ? styles.userMessageContainer : styles.assistantMessageContainer,
        ]}
      >
        <View style={[styles.avatar, isUser ? styles.userAvatar : styles.assistantAvatar]}>
          {isUser ? (
            <User color={theme.colors.userText} size={16} strokeWidth={2} />
          ) : (
            <Bot color={theme.colors.userText} size={16} strokeWidth={2} />
          )}
        </View>

        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
            isError && styles.errorBubble,
            { backgroundColor: isUser ? theme.colors.userBubble : theme.colors.assistantBubble },
          ]}
        >
          <Text
            style={[
              styles.messageText,
              {
                color: isUser ? theme.colors.userText : theme.colors.assistantText,
                fontFamily: theme.typography.weights.regular,
              },
              isError && { color: theme.colors.error },
            ]}
          >
            {message.text}
          </Text>
          <Text
            style={[
              styles.timestamp,
              {
                color: isUser
                  ? theme.colors.userText + '70'
                  : theme.colors.textMuted,
                fontFamily: theme.typography.weights.regular,
              },
            ]}
          >
            {message.timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      </View>
    );
  };

  const renderStreamingMessage = () => {
    if (!streamingMessage) return null;

    return (
      <View style={[styles.messageContainer, styles.assistantMessageContainer]}>
        <View style={[styles.avatar, styles.assistantAvatar]}>
          <Bot color={theme.colors.userText} size={16} strokeWidth={2} />
        </View>

        <View
          style={[
            styles.messageBubble,
            styles.assistantBubble,
            { backgroundColor: theme.colors.assistantBubble },
          ]}
        >
          <Text
            style={[
              styles.messageText,
              {
                color: theme.colors.assistantText,
                fontFamily: theme.typography.weights.regular,
              },
            ]}
          >
            {streamingMessage}
          </Text>
          <View style={styles.streamingIndicator}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        </View>
      </View>
    );
  };

  const renderSidebar = () => (
    <Modal
      visible={showSidebar}
      transparent
      animationType="slide"
      onRequestClose={() => setShowSidebar(false)}
    >
      <View style={styles.sidebarOverlay}>
        <TouchableOpacity 
          style={styles.sidebarBackdrop} 
          activeOpacity={1}
          onPress={() => setShowSidebar(false)}
        />
        <View style={[styles.sidebar, { backgroundColor: theme.colors.surface }]}>
          {/* Sidebar Header */}
          <View style={[styles.sidebarHeader, { borderBottomColor: theme.colors.border }]}>
            <View style={styles.sidebarHeaderLeft}>
              <TouchableOpacity onPress={() => setShowSidebar(false)}>
                <ChevronLeft color={theme.colors.text} size={24} strokeWidth={2} />
              </TouchableOpacity>
              <Text
                style={[
                  styles.sidebarTitle,
                  { color: theme.colors.text, fontFamily: theme.typography.weights.bold },
                ]}
              >
                Chat Sessions
              </Text>
            </View>
            <TouchableOpacity
              style={styles.sidebarHeaderButton}
              onPress={() => setShowConnectionManager(true)}
            >
              <Settings color={theme.colors.text} size={20} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* New Chat Button */}
          <TouchableOpacity
            style={[styles.newChatButton, { backgroundColor: theme.colors.primary }]}
            onPress={handleCreateNewChat}
          >
            <Plus color={theme.colors.userText} size={20} strokeWidth={2} />
            <Text
              style={[
                styles.newChatText,
                { color: theme.colors.userText, fontFamily: theme.typography.weights.semibold },
              ]}
            >
              New Chat
            </Text>
          </TouchableOpacity>

          {/* Chat List */}
          <ScrollView style={styles.chatList} showsVerticalScrollIndicator={false}>
            {chatSessions.map((session) => (
              <View key={session.id} style={styles.chatItemWrapper}>
                <TouchableOpacity
                  style={[
                    styles.chatItem,
                    session.isActive && { backgroundColor: theme.colors.primary + '20' },
                  ]}
                  onPress={() => handleSwitchChat(session.id)}
                >
                  <View style={styles.chatItemIcon}>
                    <MessageSquare
                      color={session.isActive ? theme.colors.primary : theme.colors.textMuted}
                      size={18}
                      strokeWidth={2}
                    />
                  </View>
                  
                  <View style={styles.chatItemContent}>
                    {editingChatId === session.id ? (
                      <View style={styles.editTitleContainer}>
                        <TextInput
                          style={[
                            styles.editTitleInput,
                            {
                              color: theme.colors.text,
                              borderColor: theme.colors.border,
                              backgroundColor: theme.colors.inputBackground,
                              fontFamily: theme.typography.weights.regular,
                            },
                          ]}
                          value={editingTitle}
                          onChangeText={setEditingTitle}
                          onSubmitEditing={handleSaveChatTitle}
                          autoFocus
                        />
                        <View style={styles.editTitleActions}>
                          <TouchableOpacity onPress={handleSaveChatTitle}>
                            <Check color={theme.colors.success} size={16} strokeWidth={2} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={handleCancelEditTitle}>
                            <X color={theme.colors.error} size={16} strokeWidth={2} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <>
                        <Text
                          style={[
                            styles.chatTitle,
                            {
                              color: session.isActive ? theme.colors.primary : theme.colors.text,
                              fontFamily: theme.typography.weights.semibold,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {session.title}
                        </Text>
                        <Text
                          style={[
                            styles.chatSubtitle,
                            {
                              color: theme.colors.textMuted,
                              fontFamily: theme.typography.weights.regular,
                            },
                          ]}
                        >
                          {session.messages.length} messages • {session.model}
                        </Text>
                      </>
                    )}
                  </View>

                  <View style={styles.chatItemActions}>
                    <TouchableOpacity
                      style={styles.chatActionButton}
                      onPress={(e) => handleEditChatTitle(session.id, session.title, e)}
                    >
                      <Edit3 color={theme.colors.textMuted} size={16} strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.chatActionButton}
                      onPress={(e) => handleDeleteChat(session.id, e)}
                    >
                      <Trash2 color={theme.colors.error} size={16} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              </View>
            ))}

            {chatSessions.length === 0 && (
              <View style={styles.emptyChatList}>
                <Text
                  style={[
                    styles.emptyChatText,
                    { color: theme.colors.textMuted, fontFamily: theme.typography.weights.regular },
                  ]}
                >
                  No chat sessions yet
                </Text>
                <Text
                  style={[
                    styles.emptyChatSubtext,
                    { color: theme.colors.textMuted, fontFamily: theme.typography.weights.regular },
                  ]}
                >
                  Create your first chat to get started
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Connection Status */}
          <View style={[styles.connectionStatus, { borderTopColor: theme.colors.border }]}>
            <View style={styles.connectionStatusContent}>
              <View style={styles.connectionStatusIndicator}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: isConnected ? theme.colors.success : theme.colors.error },
                  ]}
                />
                <Text
                  style={[
                    styles.connectionStatusText,
                    { color: theme.colors.text, fontFamily: theme.typography.weights.medium },
                  ]}
                >
                  {isConnected ? 'Connected' : 'Disconnected'}
                </Text>
              </View>
              {activeModel && (
                <Text
                  style={[
                    styles.activeModelText,
                    { color: theme.colors.textMuted, fontFamily: theme.typography.weights.regular },
                  ]}
                >
                  {activeModel.displayName}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>
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
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      backgroundColor: theme.colors.headerBackground,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    headerTitle: {
      fontSize: theme.typography.sizes.lg,
      fontFamily: theme.typography.weights.bold,
      color: theme.colors.text,
      marginLeft: theme.spacing.sm,
    },
    headerSubtitle: {
      fontSize: theme.typography.sizes.sm,
      fontFamily: theme.typography.weights.regular,
      color: theme.colors.textMuted,
      marginLeft: theme.spacing.sm,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    headerButton: {
      padding: theme.spacing.sm,
    },
    messagesContainer: {
      flex: 1,
    },
    messagesContent: {
      padding: theme.spacing.lg,
      paddingBottom: theme.spacing.xl,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.xl,
    },
    emptyStateText: {
      fontSize: theme.typography.sizes.lg,
      fontFamily: theme.typography.weights.semibold,
      color: theme.colors.text,
      textAlign: 'center',
      marginBottom: theme.spacing.sm,
    },
    emptyStateSubtext: {
      fontSize: theme.typography.sizes.md,
      fontFamily: theme.typography.weights.regular,
      color: theme.colors.textMuted,
      textAlign: 'center',
      marginBottom: theme.spacing.xl,
    },
    emptyStateButton: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    emptyStateButtonText: {
      color: theme.colors.userText,
      fontSize: theme.typography.sizes.md,
      fontFamily: theme.typography.weights.semibold,
    },
    messageContainer: {
      flexDirection: 'row',
      marginBottom: theme.spacing.lg,
      alignItems: 'flex-end',
    },
    userMessageContainer: {
      justifyContent: 'flex-end',
    },
    assistantMessageContainer: {
      justifyContent: 'flex-start',
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginHorizontal: theme.spacing.sm,
    },
    userAvatar: {
      backgroundColor: theme.colors.primary,
    },
    assistantAvatar: {
      backgroundColor: theme.colors.secondary,
    },
    messageBubble: {
      maxWidth: '75%',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.borderRadius.lg,
    },
    userBubble: {
      borderBottomRightRadius: 4,
    },
    assistantBubble: {
      borderBottomLeftRadius: 4,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    errorBubble: {
      backgroundColor: theme.colors.error + '20',
      borderColor: theme.colors.error,
    },
    messageText: {
      fontSize: theme.typography.sizes.md,
      lineHeight: 24,
    },
    timestamp: {
      fontSize: theme.typography.sizes.xs,
      marginTop: theme.spacing.xs,
    },
    streamingIndicator: {
      marginTop: theme.spacing.xs,
      alignItems: 'flex-start',
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      backgroundColor: theme.colors.surface,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    textInput: {
      flex: 1,
      backgroundColor: theme.colors.inputBackground,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.lg,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      fontSize: theme.typography.sizes.md,
      fontFamily: theme.typography.weights.regular,
      color: theme.colors.text,
      maxHeight: 120,
      marginRight: theme.spacing.sm,
    },
    sendButton: {
      backgroundColor: theme.colors.primary,
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonDisabled: {
      backgroundColor: theme.colors.border,
    },
    // Sidebar Styles
    sidebarOverlay: {
      flex: 1,
      flexDirection: 'row',
    },
    sidebarBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    sidebar: {
      width: 320,
      height: '100%',
      borderTopRightRadius: 0,
      borderBottomRightRadius: 0,
      shadowColor: '#000',
      shadowOffset: { width: 2, height: 0 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 5,
    },
    sidebarHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: theme.spacing.lg,
      borderBottomWidth: 1,
    },
    sidebarHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    sidebarTitle: {
      fontSize: theme.typography.sizes.lg,
      marginLeft: theme.spacing.sm,
    },
    sidebarHeaderButton: {
      padding: theme.spacing.sm,
    },
    newChatButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      margin: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      gap: theme.spacing.sm,
    },
    newChatText: {
      fontSize: theme.typography.sizes.md,
    },
    chatList: {
      flex: 1,
    },
    chatItemWrapper: {
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.borderLight,
    },
    chatItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    chatItemIcon: {
      width: 24,
      alignItems: 'center',
    },
    chatItemContent: {
      flex: 1,
    },
    chatTitle: {
      fontSize: theme.typography.sizes.md,
      marginBottom: 2,
    },
    chatSubtitle: {
      fontSize: theme.typography.sizes.sm,
    },
    chatItemActions: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    chatActionButton: {
      padding: theme.spacing.xs,
    },
    editTitleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    editTitleInput: {
      flex: 1,
      borderWidth: 1,
      borderRadius: theme.borderRadius.sm,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      fontSize: theme.typography.sizes.sm,
    },
    editTitleActions: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    emptyChatList: {
      padding: theme.spacing.xl,
      alignItems: 'center',
    },
    emptyChatText: {
      fontSize: theme.typography.sizes.md,
      marginBottom: theme.spacing.xs,
    },
    emptyChatSubtext: {
      fontSize: theme.typography.sizes.sm,
      textAlign: 'center',
    },
    connectionStatus: {
      borderTopWidth: 1,
      padding: theme.spacing.lg,
    },
    connectionStatusContent: {
      gap: theme.spacing.xs,
    },
    connectionStatusIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    connectionStatusText: {
      fontSize: theme.typography.sizes.sm,
    },
    activeModelText: {
      fontSize: theme.typography.sizes.xs,
      marginLeft: 20,
    },
    connectionStatusBanner: {
      backgroundColor: theme.colors.error + '20',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      margin: theme.spacing.lg,
      borderRadius: theme.borderRadius.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    connectionStatusBannerText: {
      color: theme.colors.error,
      fontSize: theme.typography.sizes.sm,
      fontFamily: theme.typography.weights.medium,
      flex: 1,
    },
    retryButton: {
      backgroundColor: theme.colors.error,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.borderRadius.sm,
    },
    retryButtonText: {
      color: theme.colors.userText,
      fontSize: theme.typography.sizes.xs,
      fontFamily: theme.typography.weights.medium,
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerLeft} onPress={() => setShowSidebar(true)}>
          <Menu color={theme.colors.primary} size={24} strokeWidth={2} />
          <View>
            <Text style={styles.headerTitle}>
              {currentSession?.title || 'New Chat'}
            </Text>
            {activeModel && (
              <Text style={styles.headerSubtitle}>
                {activeModel.displayName}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerButton} onPress={handleCreateNewChat}>
            <Plus color={theme.colors.text} size={24} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowConnectionManager(true)}
          >
            <Settings color={theme.colors.text} size={24} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Connection Status Banner */}
      {!isConnected && connectionError && (
        <View style={styles.connectionStatusBanner}>
          <Text style={styles.connectionStatusBannerText}>
            ⚠️ Not connected to AI service. Tap settings to configure.
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => setShowConnectionManager(true)}
          >
            <Text style={styles.retryButtonText}>Setup</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Messages */}
      <KeyboardAvoidingView
        style={styles.messagesContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {currentSession && currentSession.messages.length > 0 ? (
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
          >
            {currentSession.messages.map((message, index) => renderMessage(message, index))}
            {renderStreamingMessage()}
          </ScrollView>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Start a conversation</Text>
            <Text style={styles.emptyStateSubtext}>
              {activeModel
                ? `Send a message to start chatting with ${activeModel.displayName}`
                : 'Configure your AI connection to start chatting'}
            </Text>
            {!activeModel && (
              <TouchableOpacity
                style={styles.emptyStateButton}
                onPress={() => setShowConnectionManager(true)}
              >
                <Settings color={theme.colors.userText} size={20} strokeWidth={2} />
                <Text style={styles.emptyStateButtonText}>Setup AI Connection</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={
              activeModel
                ? 'Type your message...'
                : 'Configure AI connection to start chatting'
            }
            placeholderTextColor={theme.colors.textMuted}
            multiline
            editable={!!activeModel && isConnected}
            onSubmitEditing={handleSendMessage}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || isLoading || !activeModel) && styles.sendButtonDisabled,
            ]}
            onPress={handleSendMessage}
            disabled={!inputText.trim() || isLoading || !activeModel}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={theme.colors.userText} />
            ) : (
              <Send
                color={
                  inputText.trim() && activeModel ? theme.colors.userText : theme.colors.textMuted
                }
                size={20}
                strokeWidth={2}
              />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Sidebar */}
      {renderSidebar()}

      {/* Connection Manager */}
      <ConnectionManager
        visible={showConnectionManager}
        onClose={() => setShowConnectionManager(false)}
        onConnectionSuccess={() => setShowConnectionManager(false)}
      />
    </SafeAreaView>
  );
}
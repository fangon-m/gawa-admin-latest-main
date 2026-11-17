import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApiData, useMutation } from '../utils/useApiData';
import { listConversations, getConversation, sendMessage, listRecipients } from '../api/messages';
import { timeAgo, getInitials, capitalizeWords } from '../utils/helpers';
import Header from '../components/layout/Header';
import SearchBar from '../components/common/SearchBar';
import Tabs from '../components/common/Tabs';
import MessageThread from '../components/common/MessageThread';
import MessageComposer from '../components/common/MessageComposer';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Mail, SquarePen, X } from 'lucide-react';
import styles from './Messages.module.css';

const recipientTabs = [
  { key: 'customers', label: 'Customers' },
  { key: 'team', label: 'Team' },
];

function getRequestError(error, fallback) {
  const details = error?.details?.map(({ field, message }) => `${field}: ${message}`).join('; ');
  return details || error?.error || error?.message || fallback;
}

export default function Messages() {
  const { user: currentUser } = useAuth();
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [newSearch, setNewSearch] = useState('');
  const [recipientScope, setRecipientScope] = useState('customers');
  const [messageError, setMessageError] = useState('');
  const [sending, setSending] = useState(false);

  // The URL is the source of truth for the open thread, so /messages/:userId
  // can be linked to directly (User Detail's "Send Message") and survives a
  // refresh or the browser's back/forward buttons.
  const activeConv = conversationId || null;

  const currentUserId = currentUser?.id;

  const { data: inbox, error: conversationsError, refetch: refetchConvs } = useApiData(() => listConversations(), [], {
    defaultValue: { conversations: [], unreadCount: 0 },
    transform: (response) => {
      const conversations = response?.data ?? response ?? [];
      return {
        conversations,
        unreadCount: response?.unreadCount ?? conversations.reduce((count, conv) => count + (conv.unreadCount || 0), 0),
      };
    },
  });
  const conversations = inbox.conversations;

  // Recipients come from a dedicated endpoint: customers are verified-only,
  // team is staff-to-staff. /api/users deliberately never returns staff rows.
  const { data: recipients, loading: recipientsLoading } = useApiData(
    () => listRecipients({ scope: recipientScope }),
    [recipientScope],
    { defaultValue: [] }
  );

  const { data: activeData, error: activeError, refetch: refetchConv } = useApiData(
    () => activeConv ? getConversation(activeConv) : Promise.resolve({ data: null }),
    [activeConv],
    { defaultValue: null, transform: (r) => r?.data ?? r, immediate: !!activeConv }
  );

  const [doSendMessage] = useMutation(sendMessage);
  const totalUnread = inbox.unreadCount;

  useEffect(() => {
    if (activeConv && activeData?.id === activeConv) {
      refetchConvs();
    }
  }, [activeConv, activeData, refetchConvs]);

  const filteredConvs = useMemo(() => {
    let data = [...conversations];
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((c) =>
        (c.participants || []).some((p) => p.name?.toLowerCase().includes(q))
      );
    }
    return data;
  }, [search, conversations]);

  const existingConvUserIds = useMemo(() => {
    const ids = new Set();
    for (const conv of conversations) {
      for (const p of (conv.participants || [])) {
        if (p.userId !== currentUserId) ids.add(p.userId);
      }
    }
    return ids;
  }, [conversations, currentUserId]);

  const availableUsers = useMemo(() => {
    if (!showNewMessage) return [];
    let list = (recipients || []).filter((u) => u.id !== currentUserId);
    if (newSearch) {
      const q = newSearch.toLowerCase();
      list = list.filter((u) =>
        u.name?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [showNewMessage, newSearch, recipients, currentUserId]);

  // Ignore data for a thread other than the one in the URL: useApiData keeps
  // the previous result while the next request is in flight.
  const thread = activeConv && activeData?.id === activeConv ? activeData : null;

  const otherParticipant = thread
    ? (thread.participants || []).find((p) => p.userId !== currentUserId)
    : null;

  const openConversation = useCallback((id) => {
    if (!id) return;
    setMessageError('');
    navigate(`/messages/${id}`);
  }, [navigate]);

  const handleStartConversation = useCallback((selectedUser) => {
    setMessageError('');
    openConversation(selectedUser.id);
    setShowNewMessage(false);
    setNewSearch('');
  }, [openConversation]);

  const handleSend = async (text) => {
    if (!activeConv || sending) return false;
    setMessageError('');
    setSending(true);
    try {
      await doSendMessage({ conversationId: activeConv, text });
      await Promise.all([refetchConv(), refetchConvs()]);
      return true;
    } catch (err) {
      setMessageError(getRequestError(err, 'Unable to send message.'));
      return false;
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <Header title="Messages" />
      {(messageError || conversationsError || activeError) && (
        <div className="alert alert-error" role="alert">
          {messageError || conversationsError || activeError}
        </div>
      )}
      <div className="messages-layout">
        <div className="messages-list">
          <div className="messages-list-header">
            <div className={styles.listTitleRow}>
              <span className={styles.listTitle}>Inbox</span>
              {totalUnread > 0 && (
                <span className={styles.unreadTotal}>{totalUnread} unread</span>
              )}
            </div>
            <div className={styles.listHeaderRow}>
              <SearchBar value={search} onChange={setSearch} placeholder="Search users..." />
              <button
                className={`btn btn-ghost btn-sm ${styles.newMsgBtn}`}
                onClick={() => setShowNewMessage(!showNewMessage)}
                title="New message"
              >
                <SquarePen size={15} />
              </button>
            </div>
          </div>
          {showNewMessage ? (
            <div className={styles.newMessagePanel}>
              <div className={styles.newMessagePanelHeader}>
                <span className={styles.newMessagePanelTitle}>New Message</span>
                <button className={styles.newMessagePanelClose} onClick={() => { setShowNewMessage(false); setNewSearch(''); }}>
                  <X size={16} />
                </button>
              </div>
              <div className={styles.recipientTabs}>
                <Tabs
                  tabs={recipientTabs}
                  activeTab={recipientScope}
                  onChange={(scope) => { setRecipientScope(scope); setNewSearch(''); }}
                />
              </div>
              <div className={styles.newMessageSearch}>
                <SearchBar
                  value={newSearch}
                  onChange={setNewSearch}
                  placeholder={recipientScope === 'team' ? 'Search team...' : 'Search customers...'}
                />
              </div>
              <div className={styles.userList}>
                {availableUsers.length === 0 ? (
                  <div className={styles.userListEmpty}>
                    <div>
                      <div>
                        {recipientsLoading
                          ? <LoadingSpinner size="sm" label="Loading..." />
                          : recipientScope === 'team'
                            ? 'No team members found'
                            : 'No verified users found'}
                      </div>
                      {!recipientsLoading && recipientScope === 'customers' && (
                        <div className={styles.userListEmptyHint}>
                          Only verified users can receive messages.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  availableUsers.map((u) => (
                    <div
                      key={u.id}
                      className={`${styles.userItem}${existingConvUserIds.has(u.id) ? '' : ' ' + styles.userItemNew}`}
                      onClick={() => handleStartConversation(u)}
                    >
                      <div className="conversation-avatar">{getInitials(u.name)}</div>
                      <div className={styles.userItemInfo}>
                        <div className={styles.userItemName}>{u.name}</div>
                        <div className={styles.userItemMeta}>
                          <span className={styles.userItemRole}>{capitalizeWords(u.role)}</span>
                          <span className={styles.userItemStatus}>{u.isStaff ? 'Team' : 'Verified'}</span>
                          {!existingConvUserIds.has(u.id) && (
                            <span className={styles.userItemBadge}>New</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="conversation-list">
              {filteredConvs.length === 0 ? (
                <div className="empty-state" style={{ padding: '2rem' }}>
                  <div className="empty-state-text">No conversations</div>
                </div>
              ) : (
                filteredConvs.map((conv) => {
                  const other = (conv.participants || []).find((p) => p.userId !== currentUserId);
                  const unreadCount = conv.unreadCount || 0;
                  return (
                    <div
                      key={conv.id}
                      className={`conversation-item${activeConv === conv.id ? ' active' : ''}${unreadCount > 0 ? ' unread' : ''}`}
                      onClick={() => openConversation(conv.id)}
                    >
                      <div className="conversation-avatar">{getInitials(other?.name || '?')}</div>
                      <div className="conversation-info">
                        <div className="conversation-name">
                          {other?.name || 'Unknown'}
                          {['admin', 'customer_support'].includes(other?.role) && (
                            <span className={styles.staffBadge}>
                              {other.role === 'admin' ? 'Admin' : 'Support'}
                            </span>
                          )}
                        </div>
                        <div className="conversation-preview">{conv.lastMessage}</div>
                      </div>
                      <div className="conversation-meta">
                        <div className="conversation-time">{timeAgo(conv.lastMessageAt)}</div>
                        {unreadCount > 0 && (
                          <div className="conversation-unread-badge" aria-label={`${unreadCount} unread messages`}>
                            {unreadCount}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
        <div className="messages-thread">
          {!thread ? (
            <div className="empty-state" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div>
                <div className="empty-state-icon"><Mail size={40} /></div>
                <div className="empty-state-text">Select a conversation</div>
                <div className="empty-state-sub">Choose a conversation from the list to view messages</div>
              </div>
            </div>
          ) : (
            <>
              <div className="messages-thread-header">
                <div className="conversation-avatar">{getInitials(otherParticipant?.name || '?')}</div>
                <div>
                  <div className="conversation-name">{otherParticipant?.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{capitalizeWords(otherParticipant?.role)}</div>
                </div>
              </div>
              <div className="messages-thread-body">
                <MessageThread messages={thread.messages || []} currentUserId={currentUserId} />
              </div>
              {otherParticipant?.isArchived ? (
                <div style={{ padding: '1rem', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)' }}>
                  This account is archived. Unarchive it to send messages.
                </div>
              ) : (
                <MessageComposer onSend={handleSend} disabled={sending} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

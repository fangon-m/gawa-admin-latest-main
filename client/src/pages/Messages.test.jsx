import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Messages from './Messages';
import { useApiData } from '../utils/useApiData';

const { refetchConversations } = vi.hoisted(() => ({
  refetchConversations: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1' } }),
}));

vi.mock('../utils/useApiData', () => ({
  useApiData: vi.fn(),
  useMutation: () => [vi.fn(), { loading: false }],
}));

vi.mock('../api/messages', () => ({
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('../api/users', () => ({
  list: vi.fn(),
}));

vi.mock('../components/layout/Header', () => ({
  default: ({ title }) => <h1>{title}</h1>,
}));

vi.mock('../components/common/SearchBar', () => ({
  default: ({ value, onChange, placeholder }) => (
    <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
  ),
}));

vi.mock('../components/common/MessageComposer', () => ({
  default: () => <div>Composer</div>,
}));

describe('Messages', () => {
  beforeEach(() => {
    let callIndex = 0;
    refetchConversations.mockReset();
    useApiData.mockImplementation((_fetch, deps, options) => {
      const call = callIndex++ % 3;
      if (call === 0) {
        return {
          data: {
            conversations: [{
              id: 'user-1',
              participants: [
                { userId: 'admin-1', name: 'Admin' },
                { userId: 'user-1', name: 'Sam User' },
              ],
              lastMessage: 'Hello',
              lastMessageAt: '2026-11-08T09:00:00.000Z',
              unread: true,
              unreadCount: 3,
            }],
            unreadCount: 3,
          },
          error: null,
          refetch: refetchConversations,
        };
      }
      if (call === 1) return { data: [], error: null, refetch: vi.fn() };
      return {
        data: options?.immediate && deps?.[0] ? {
          id: 'user-1',
          participants: [
            { userId: 'admin-1', name: 'Admin' },
            { userId: 'user-1', name: 'Sam User' },
          ],
          messages: [{
            id: 'message-1',
            senderId: 'admin-1',
            receiverId: 'user-1',
            text: 'Reply',
            createdAt: '2026-11-08T09:00:00.000Z',
            readAt: '2026-11-08T09:01:00.000Z',
          }],
        } : null,
        error: null,
        refetch: vi.fn(),
      };
    });
  });

  it('shows unread counts and refreshes the inbox when a conversation is opened', async () => {
    render(<Messages />);

    expect(screen.getByText('3 unread')).toBeInTheDocument();
    expect(screen.getByLabelText('3 unread messages')).toHaveTextContent('3');

    fireEvent.click(screen.getByText('Sam User'));

    expect(await screen.findByText('Seen')).toBeInTheDocument();
    await waitFor(() => expect(refetchConversations).toHaveBeenCalled());
  });
});

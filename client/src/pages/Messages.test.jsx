// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Messages from './Messages';
import { useApiData } from '../utils/useApiData';

// Vitest runs without globals here, so Testing Library cannot auto-unmount the
// previous test's tree. Without this the second render duplicates every node.
afterEach(cleanup);

const { refetchConversations } = vi.hoisted(() => ({
  refetchConversations: vi.fn(),
}));

const inbox = {
  conversations: [{
    id: 'user-1',
    participants: [
      { userId: 'admin-1', name: 'Admin', role: 'admin' },
      { userId: 'user-1', name: 'Sam User', role: 'client' },
    ],
    lastMessage: 'Hello',
    lastMessageAt: '2026-11-08T09:00:00.000Z',
    unread: true,
    unreadCount: 3,
  }],
  unreadCount: 3,
};

const customerRecipient = {
  id: 'user-2',
  name: 'Cara Customer',
  email: 'cara@example.com',
  role: 'client',
  isStaff: false,
  isVerified: true,
};

const teamRecipient = {
  id: 'admin-2',
  name: 'Ana Admin',
  email: 'ana@gawa.local',
  role: 'admin',
  isStaff: true,
  isVerified: false,
};

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
  listRecipients: vi.fn(),
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

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

// Renders the page with the same two routes App.jsx registers, so deep links
// and in-page navigation exercise real routing instead of a mock.
function renderMessages(initialPath = '/messages') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocationProbe />
      <Routes>
        <Route path="/messages" element={<Messages />} />
        <Route path="/messages/:conversationId" element={<Messages />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Messages', () => {
  beforeEach(() => {
    refetchConversations.mockReset();
    // Route each useApiData call by its arguments rather than call order, so
    // adding a query to the page does not silently reshuffle the mock.
    useApiData.mockImplementation((_fetch, deps = [], options = {}) => {
      const defaultValue = options?.defaultValue;

      if (defaultValue && !Array.isArray(defaultValue) && defaultValue.conversations) {
        return { data: inbox, error: null, refetch: refetchConversations };
      }

      if (Array.isArray(defaultValue)) {
        return {
          data: deps[0] === 'team' ? [teamRecipient] : [customerRecipient],
          loading: false,
          error: null,
          refetch: vi.fn(),
        };
      }

      return {
        data: deps[0] ? {
          id: 'user-1',
          participants: [
            { userId: 'admin-1', name: 'Admin', role: 'admin' },
            { userId: 'user-1', name: 'Sam User', role: 'client' },
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
    renderMessages();

    expect(screen.getByText('3 unread')).toBeInTheDocument();
    expect(screen.getByLabelText('3 unread messages')).toHaveTextContent('3');

    fireEvent.click(screen.getByText('Sam User'));

    expect(await screen.findByText('Seen')).toBeInTheDocument();
    // The open thread is encoded in the URL so it can be linked and refreshed.
    expect(screen.getByTestId('location')).toHaveTextContent('/messages/user-1');
    await waitFor(() => expect(refetchConversations).toHaveBeenCalled());
  });

  it('opens the exact thread from a /messages/:userId deep link', () => {
    renderMessages('/messages/user-1');

    expect(screen.getByTestId('location')).toHaveTextContent('/messages/user-1');
    expect(screen.getByText('Reply')).toBeInTheDocument();
    expect(screen.getByText('Seen')).toBeInTheDocument();
    expect(screen.getByText('Composer')).toBeInTheDocument();
  });

  it('offers team members so staff can message an administrator', async () => {
    renderMessages();

    fireEvent.click(screen.getByTitle('New message'));

    expect(screen.getByText('Customers')).toBeInTheDocument();
    expect(screen.getByText('Team')).toBeInTheDocument();
    expect(screen.getByText('Cara Customer')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Team'));

    expect(await screen.findByText('Ana Admin')).toBeInTheDocument();
  });

  it('marks staff conversations in the inbox', () => {
    useApiData.mockImplementation((_fetch, deps = [], options = {}) => {
      const defaultValue = options?.defaultValue;
      if (defaultValue && !Array.isArray(defaultValue) && defaultValue.conversations) {
        return {
          data: {
            conversations: [{
              id: 'admin-2',
              participants: [
                { userId: 'admin-1', name: 'Admin', role: 'admin' },
                { userId: 'admin-2', name: 'Ana Admin', role: 'admin' },
              ],
              lastMessage: 'Need a ruling',
              lastMessageAt: '2026-11-08T09:00:00.000Z',
              unread: false,
              unreadCount: 0,
            }],
            unreadCount: 0,
          },
          error: null,
          refetch: refetchConversations,
        };
      }
      if (Array.isArray(defaultValue)) return { data: [], loading: false, error: null, refetch: vi.fn() };
      return { data: null, error: null, refetch: vi.fn() };
    });

    renderMessages();

    expect(screen.getByText('Ana Admin')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });
});

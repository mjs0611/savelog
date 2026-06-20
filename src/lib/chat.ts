import { supabase, isSupabaseConfigured } from './supabase';

export interface ChatMessage {
  id: string;
  user_id: string;
  nickname: string;
  persona?: string;
  type: 'text' | 'entry_share';
  message?: string;
  entry_data?: any;
  room_id?: string;
  created_at: string;
}

export async function fetchChatHistory(roomId = 'global', limit = 50): Promise<ChatMessage[]> {
  if (!isSupabaseConfigured || !supabase) {
    return [];
  }
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) {
    console.error('Error fetching chat history:', error);
    return [];
  }
  // Reverse to get chronological order (oldest to newest)
  return (data as ChatMessage[]).reverse();
}

export async function sendChatMessage(
  userId: string,
  nickname: string,
  persona: string | undefined,
  type: 'text' | 'entry_share',
  message?: string,
  entryData?: any,
  roomId = 'global'
): Promise<ChatMessage | null> {
  const payload = {
    user_id: userId,
    nickname,
    persona,
    type,
    message,
    entry_data: entryData,
    room_id: roomId,
    created_at: new Date().toISOString()
  };

  if (!isSupabaseConfigured || !supabase) {
    // Mock 모드: 즉시 로컬용 목 객체 생성
    return {
      id: 'mock-' + Math.random().toString(36).substring(2, 9),
      ...payload
    };
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    console.error('Error sending message:', error);
    return null;
  }
  return data as ChatMessage;
}

export function subscribeToChat(
  onMessageReceived: (msg: ChatMessage) => void
): (() => void) | null {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  const channel = supabase
    .channel('savelog-chat-changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages' },
      (payload) => {
        onMessageReceived(payload.new as ChatMessage);
      }
    )
    .subscribe();

  return () => {
    if (supabase) {
      supabase.removeChannel(channel);
    }
  };
}

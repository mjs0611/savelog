import React, { useState, useEffect, useRef } from 'react';
import {
  ChatMessage,
  fetchChatHistory,
  sendChatMessage,
  subscribeToChat
} from '../lib/chat';
import { PERSONAS, getPersona } from '../lib/storage';
import { toggleReaction } from '../lib/supabase';
import CustomIcon, { hasMappedIcon } from '../components/CustomIcon';

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

interface ChatScreenProps {
  userId: string;
  nickname: string;
  sharedEntryToPost?: any; // App.tsx에서 전달하는 공유 전용 state
  clearSharedEntry?: () => void;
}

interface FloatingReaction {
  id: string;
  emoji: string;
  x: number;
  y: number;
}

interface GroupChatRoom {
  id: string;
  name: string;
  code: string;
  isCreator: boolean;
}

const OPEN_ROOMS = [
  { id: 'global', name: '🌿 오늘의 한 줄', desc: '오늘 하루 어땠는지 가볍게 나누는 방' },
  { id: 'coffee', name: '☕ 카페 추천 & 홈카페', desc: '내 가성비 카페·홈카페 레시피 공유' },
  { id: 'delivery', name: '🍳 집밥 같이 해요', desc: '오늘 뭐 해먹지 함께 고민하는 방' }
];

function renderTextWithEmoji(text: string) {
  if (!text) return <></>;
  const result: React.ReactNode[] = [];
  let buffer = '';
  for (const { segment } of graphemeSegmenter.segment(text)) {
    if (hasMappedIcon(segment)) {
      if (buffer) { result.push(buffer); buffer = ''; }
      result.push(<CustomIcon key={result.length} emoji={segment} />);
    } else {
      buffer += segment;
    }
  }
  if (buffer) result.push(buffer);
  return <>{result}</>;
}

export default function ChatScreen({ userId, nickname, sharedEntryToPost, clearSharedEntry }: ChatScreenProps) {
  const [chatTab, setChatTab] = useState<'open' | 'group'>('open');
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRoomName, setActiveRoomName] = useState<string>('');
  
  // 일반 톡방 (그룹 초대방) 목록
  const [groupRooms, setGroupRooms] = useState<GroupChatRoom[]>(() => {
    try {
      const saved = localStorage.getItem('savelog_group_chats');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);

  // 모달 입력용 상태
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinRoomName, setJoinRoomName] = useState('');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const subscriptionRef = useRef<(() => void) | null>(null);
  const userPersona = getPersona() || 'pig';

  // 1. 방 목록 보존
  useEffect(() => {
    localStorage.setItem('savelog_group_chats', JSON.stringify(groupRooms));
  }, [groupRooms]);

  // 2. 활성화된 방 변경 시 대화 내역 로드 및 실시간 구독 처리
  useEffect(() => {
    if (!activeRoomId) {
      setMessages([]);
      return;
    }

    (async () => {
      setLoading(true);
      const history = await fetchChatHistory(activeRoomId);
      setMessages(history);
      setLoading(false);
      scrollToBottom();
    })();

    // 실시간 메시지 구독
    const unsub = subscribeToChat((newMsg) => {
      if (newMsg.room_id === activeRoomId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }
    });

    subscriptionRef.current = unsub;
    return () => {
      if (subscriptionRef.current) subscriptionRef.current();
    };
  }, [activeRoomId]);

  // 3. 내비게이션으로 전달받은 '공유하기' 지출 처리
  useEffect(() => {
    if (sharedEntryToPost) {
      const targetRoomId = activeRoomId || 'global';
      if (!activeRoomId) {
        setActiveRoomId(targetRoomId);
        const matched = OPEN_ROOMS.find(r => r.id === targetRoomId);
        setActiveRoomName(matched ? matched.name : '🔥 실시간 무지출 화력방');
      }
      handleSharePost(sharedEntryToPost, targetRoomId);
      if (clearSharedEntry) clearSharedEntry();
    }
  }, [sharedEntryToPost]);

  // 4. 새로운 메시지 수신 시 스크롤 하단 이동
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 메시지 전송
  const handleSendText = async () => {
    if (!inputText.trim() || !activeRoomId) return;
    const text = inputText.trim();
    setInputText('');

    const result = await sendChatMessage(userId, nickname, userPersona, 'text', text, undefined, activeRoomId);
    if (result) {
      setMessages((prev) => [...prev, result]);
    }
  };

  // 지출 공유 발행
  const handleSharePost = async (entry: any, roomId: string) => {
    const entryData = {
      id: entry.id,
      nickname: entry.nickname,
      persona: entry.persona,
      total_amount: entry.total_amount,
      items: entry.items
    };

    const result = await sendChatMessage(
      userId,
      nickname,
      userPersona,
      'entry_share',
      undefined,
      entryData,
      roomId
    );
    if (result) {
      setMessages((prev) => [...prev, result]);
    }
  };

  // 영수증 리액션 처리 (혼내기 / 칭찬하기)
  const handleReactToSharedEntry = async (msgId: string, entryId: string, type: 'trust' | 'doubt', e: React.MouseEvent) => {
    const container = messagesContainerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top + container.scrollTop;
      const emoji = type === 'trust' ? '👏' : '🧸';

      const newReaction: FloatingReaction = {
        id: Math.random().toString(36).substring(2, 9),
        emoji,
        x: clickX,
        y: clickY
      };

      setFloatingReactions((prev) => [...prev, newReaction]);

      setTimeout(() => {
        setFloatingReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
      }, 1000);
    }

    // 로컬 카운트 낙관적 반영
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === msgId && msg.entry_data) {
          const key = type === 'trust' ? 'trust_count' : 'doubt_count';
          const currentCount = msg.entry_data[key] ?? 0;
          return {
            ...msg,
            entry_data: {
              ...msg.entry_data,
              [key]: currentCount + 1
            }
          };
        }
        return msg;
      })
    );

    if (entryId) {
      await toggleReaction(entryId, userId, type);
    }
  };

  // 톡방 개설 처리
  const handleCreateRoomSubmit = () => {
    if (!newRoomName.trim()) return;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randCode = '';
    for (let i = 0; i < 6; i++) {
      randCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const code = `CHAT-${randCode}`;

    const newRoom: GroupChatRoom = {
      id: code,
      name: newRoomName.trim(),
      code: code,
      isCreator: true
    };

    setGroupRooms(prev => [newRoom, ...prev]);
    setNewRoomName('');
    setShowCreateModal(false);
    
    // 개설 즉시 입장
    setActiveRoomId(newRoom.id);
    setActiveRoomName(newRoom.name);
  };

  // 초대 코드로 참여 처리
  const handleJoinRoomSubmit = () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;

    // 중복 체크
    if (groupRooms.some(r => r.code === code)) {
      alert('이미 참여 중인 일반 톡방입니다.');
      return;
    }

    const newRoom: GroupChatRoom = {
      id: code,
      name: joinRoomName.trim() || `그룹 톡방 (${code})`,
      code: code,
      isCreator: false
    };

    setGroupRooms(prev => [...prev, newRoom]);
    setJoinCode('');
    setJoinRoomName('');
    setShowJoinModal(false);

    // 즉시 입장
    setActiveRoomId(newRoom.id);
    setActiveRoomName(newRoom.name);
  };

  // 톡방 탈퇴 기능
  const handleLeaveRoom = (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('정말 이 톡방에서 나가시겠습니까?')) {
      setGroupRooms(prev => prev.filter(r => r.id !== roomId));
      if (activeRoomId === roomId) {
        setActiveRoomId(null);
      }
    }
  };

  // 초대 코드 복사
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    alert(`초대 코드(${code})가 복사되었습니다! 친구에게 공유해 보세요.`);
  };

  // 대화 기록에서 최근 대화 참여자 추출 (stateless Presence 대체)
  const getRecentParticipants = () => {
    const uniques = new Map<string, string>();
    // 내 닉네임 추가
    uniques.set(userId, userPersona);
    
    // 최근 20개 메시지를 보며 참여자 추출
    const recent = messages.slice(-20);
    for (const m of recent) {
      if (m.user_id && m.persona && !uniques.has(m.user_id)) {
        uniques.set(m.user_id, m.persona);
      }
    }
    
    return Array.from(uniques.entries()).map(([uId, personaKey]) => ({
      id: uId,
      persona: personaKey,
      name: uId === userId ? '나' : messages.find(m => m.user_id === uId)?.nickname || '짠친구'
    }));
  };

  // ── 1. 개별 톡방 대화 뷰 ──
  if (activeRoomId) {
    const isGroupChat = activeRoomId.startsWith('CHAT-');
    const participants = getRecentParticipants();

    return (
      <div className="screen screen-chat" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* 상단 톡방 헤더 */}
        <div className="chat-room-header glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--glass-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button className="chat-back-btn" onClick={() => setActiveRoomId(null)} style={{ fontSize: '18px', color: 'var(--text-main)' }}>
              ←
            </button>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="chat-room-title" style={{ fontWeight: 700, fontSize: '15px' }}>{renderTextWithEmoji(activeRoomName)}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-mute)' }}>
                {isGroupChat ? '그룹 비공개방' : '공개 오픈 톡방'}
              </span>
            </div>
          </div>
          {isGroupChat && (
            <button className="chat-invite-copy-btn" onClick={() => handleCopyCode(activeRoomId)} style={{ fontSize: '11px', background: 'var(--primary)', color: '#fff', padding: '6px 12px', borderRadius: '20px', fontWeight: 600 }}>
              코드 복사 <CustomIcon emoji="👥" />
            </button>
          )}
        </div>

        {/* 최근 참여자 바 (가상 캐릭터 제거, 최근 대화자 리스트) */}
        <div className="chat-presence-bar">
          <div className="chat-presence-title">
            <span>최근 참여</span>
            <span className="presence-count">{participants.length}명</span>
          </div>
          <div className="chat-presence-users">
            {participants.map((p) => {
              const bp = PERSONAS[p.persona];
              return (
                <div key={p.id} className="presence-user-avatar-wrap">
                  <span className="presence-user-avatar">
                    {bp ? <img src={bp.icon} alt="" className="custom-icon--sm" /> : <CustomIcon emoji="🐷" className="custom-icon--sm" />}
                  </span>
                  <span className="presence-username">{p.name.split(' ')[0]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 메시지 영역 */}
        <div className="chat-messages-container" ref={messagesContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
          {loading ? (
            <div className="chat-loading-wrap" style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <span style={{ color: 'var(--text-mute)', fontSize: '13px' }}>대화 불러오는 중... 💬</span>
            </div>
          ) : messages.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px 20px', color: 'var(--text-mute)' }}>
              <span style={{ opacity: 0.3, marginBottom: '10px', display: 'inline-block' }}><CustomIcon emoji="💬" className="custom-icon--lg" /></span>
              <p style={{ fontSize: '13px' }}>아직 대화가 없습니다.</p>
              {isGroupChat && <p style={{ fontSize: '11px', marginTop: '4px' }}>코드를 공유해 친구들을 초대하고 대화를 시작해 보세요!</p>}
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.user_id === userId;
              const p = msg.persona ? PERSONAS[msg.persona] : null;

              return (
                <div key={msg.id} className={`chat-message-row ${isMe ? 'chat-message-row--me' : ''}`}>
                  {!isMe && (
                    <div className="chat-msg-avatar">
                      {p ? <img src={p.icon} alt="" className="custom-icon--md" /> : <CustomIcon emoji="🐷" className="custom-icon--md" />}
                    </div>
                  )}

                  <div className="chat-msg-content-area">
                    {!isMe && (
                      <span className="chat-msg-sender-name">
                        {msg.nickname} 
                        {p && <span className="chat-msg-sender-tag" style={{ color: p.color }}>{p.name.split(' ')[1] || p.name}</span>}
                      </span>
                    )}

                    {msg.type === 'text' && (
                      <div className={`chat-msg-bubble ${isMe ? 'chat-msg-bubble--me' : ''}`}>
                        {msg.message}
                      </div>
                    )}

                    {msg.type === 'entry_share' && msg.entry_data && (() => {
                      const entry = msg.entry_data;
                      const items = entry.items || [];
                      const spendItems = items.filter((it: any) => it.category !== '한마디');

                      return (
                        <div className="chat-share-card glass-card">
                          <div className="chat-share-card-header">
                            <span className="chat-share-tag"><CustomIcon emoji="📝" /> 소비기록 공유</span>
                            <span className="chat-share-card-author">{entry.nickname}님</span>
                          </div>

                          <div className="chat-receipt-box">
                            {spendItems.map((item: any, idx: number) => (
                              <div key={idx} className="chat-receipt-item">
                                <span className="chat-receipt-item-label">
                                  <CustomIcon emoji={item.emoji} /> {item.category}
                                </span>
                                <span className="chat-receipt-item-amount">{item.amount > 0 ? `${item.amount.toLocaleString()}원` : '0원'}</span>
                              </div>
                            ))}
                            <div className="chat-receipt-divider" />
                            <div className="chat-receipt-total">
                              <span>합계</span>
                              <span className="chat-receipt-total-val" style={{ color: entry.total_amount === 0 ? 'var(--success)' : 'var(--error)' }}>
                                {entry.total_amount === 0 ? <>무지출 <CustomIcon emoji="✨" /></> : `${entry.total_amount.toLocaleString()}원`}
                              </span>
                            </div>
                          </div>

                          <div className="chat-share-actions">
                            <button
                              className="chat-share-react-btn chat-share-react-btn--praise"
                              onClick={(e) => handleReactToSharedEntry(msg.id, entry.id, 'trust', e)}
                            >
                              <CustomIcon emoji="👏" /> 칭찬해 {(entry.trust_count ?? 0) > 0 && <strong className="react-count">{entry.trust_count}</strong>}
                            </button>
                            <button
                              className="chat-share-react-btn chat-share-react-btn--scold"
                              onClick={(e) => handleReactToSharedEntry(msg.id, entry.id, 'doubt', e)}
                            >
                              <CustomIcon emoji="🧸" /> 토닥토닥 {(entry.doubt_count ?? 0) > 0 && <strong className="react-count">{entry.doubt_count}</strong>}
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />

          {floatingReactions.map((r) => (
            <span key={r.id} className="floating-reaction-bubble" style={{ left: r.x, top: r.y }}>
              {r.emoji}
            </span>
          ))}
        </div>

        {/* 메시지 입력 행 */}
        <div className="chat-input-bar">
          <div className="chat-input-wrapper">
            <input
              type="text"
              className="chat-text-input"
              placeholder="메세지를 입력해 보세요..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
            />
            <button className="chat-send-btn" onClick={handleSendText}>
              전송
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 2. 톡방 로비(목록) 뷰 ──
  return (
    <div className="screen screen-chat" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px 14px' }}>
      {/* 톡방 탭 헤더 */}
      <div className="chat-lobby-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          className={`chat-lobby-tab-btn ${chatTab === 'open' ? 'active' : ''}`}
          onClick={() => setChatTab('open')}
          style={{
            flex: 1,
            padding: '10px 0',
            borderRadius: '12px',
            fontWeight: 700,
            fontSize: '14px',
            textAlign: 'center',
            background: chatTab === 'open' ? 'var(--primary)' : 'var(--bg)',
            color: chatTab === 'open' ? '#fff' : 'var(--text-sub)',
            boxShadow: chatTab === 'open' ? '0 4px 12px var(--primary-glow)' : 'none',
            whiteSpace: 'nowrap'
          }}
        >
          오픈 톡방 (공개)
        </button>
        <button
          className={`chat-lobby-tab-btn ${chatTab === 'group' ? 'active' : ''}`}
          onClick={() => setChatTab('group')}
          style={{
            flex: 1,
            padding: '10px 0',
            borderRadius: '12px',
            fontWeight: 700,
            fontSize: '14px',
            textAlign: 'center',
            background: chatTab === 'group' ? 'var(--primary)' : 'var(--bg)',
            color: chatTab === 'group' ? '#fff' : 'var(--text-sub)',
            boxShadow: chatTab === 'group' ? '0 4px 12px var(--primary-glow)' : 'none',
            whiteSpace: 'nowrap'
          }}
        >
          일반 톡방 (그룹)
        </button>
      </div>

      {/* 탭 내용 */}
      {chatTab === 'open' ? (
        <div className="chat-rooms-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1 }}>
          {OPEN_ROOMS.map((room) => (
            <div
              key={room.id}
              className="chat-room-card glass-card"
              onClick={() => {
                setActiveRoomId(room.id);
                setActiveRoomName(room.name);
              }}
              style={{ padding: '16px', borderRadius: '18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'transform 0.2s' }}
            >
              <div>
                <h4 style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-main)', marginBottom: '4px' }}>{renderTextWithEmoji(room.name)}</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-sub)' }}>{renderTextWithEmoji(room.desc)}</p>
              </div>
              <span style={{ color: 'var(--primary)', fontSize: '18px', fontWeight: 'bold' }}>›</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {/* 그룹방 개설/초대 버튼 행 */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                flex: 1,
                padding: '8px 0',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 600,
                border: '1px solid var(--primary)',
                color: 'var(--primary)',
                background: 'var(--primary-light)'
              }}
            >
              방 개설하기 <CustomIcon emoji="🍳" />
            </button>
            <button
              onClick={() => setShowJoinModal(true)}
              style={{
                flex: 1,
                padding: '8px 0',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 600,
                border: '1px solid var(--glass-border)',
                color: 'var(--text-main)',
                background: 'var(--bg)',
                whiteSpace: 'nowrap'
              }}
            >
              초대코드로 참여 <CustomIcon emoji="👥" />
            </button>
          </div>

          {/* 방 리스트 */}
          <div className="chat-rooms-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1 }}>
            {groupRooms.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '40px 20px', color: 'var(--text-mute)', textAlign: 'center' }}>
                <span style={{ opacity: 0.3, marginBottom: '12px', display: 'inline-block' }}><CustomIcon emoji="👥" className="custom-icon--lg" /></span>
                <p style={{ fontSize: '13px', fontWeight: 600 }}>아직 참여 중인 일반 톡방이 없어요.</p>
                <p style={{ fontSize: '11px', marginTop: '4px' }}>방을 새로 개설하거나 친구의 초대 코드를 입력해 보세요!</p>
              </div>
            ) : (
              groupRooms.map((room) => (
                <div
                  key={room.id}
                  className="chat-room-card glass-card"
                  onClick={() => {
                    setActiveRoomId(room.id);
                    setActiveRoomName(room.name);
                  }}
                  style={{ padding: '16px', borderRadius: '18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-main)', marginBottom: '4px' }}>{renderTextWithEmoji(room.name)}</h4>
                    <p style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600 }}>초대코드: {room.code}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                      className="chat-room-leave-btn"
                      onClick={(e) => handleLeaveRoom(room.id, e)}
                      style={{ fontSize: '11px', color: 'var(--error)', background: 'rgba(255, 77, 79, 0.08)', padding: '4px 8px', borderRadius: '6px' }}
                    >
                      나가기
                    </button>
                    <span style={{ color: 'var(--primary)', fontSize: '18px', fontWeight: 'bold' }}>›</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── 3. 방 생성 모달 ── */}
      {showCreateModal && (
        <div className="story-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="story-modal-sheet glass-card" onClick={(e) => e.stopPropagation()}>
            <div className="story-modal-header">
              <h3 className="story-modal-name">새로운 일반 톡방 개설 <CustomIcon emoji="🍳" /></h3>
              <p className="story-modal-label">초대 코드를 가진 지인들과 비공개로 대화할 방을 만듭니다.</p>
            </div>
            <div className="story-modal-content" style={{ marginTop: '16px' }}>
              <div className="group-form-field" style={{ marginBottom: '16px' }}>
                <label className="group-form-label" style={{ display: 'block', fontSize: '12px', color: 'var(--text-sub)', marginBottom: '6px' }}>톡방 이름</label>
                <input
                  type="text"
                  placeholder="예) 우리집 생활비 수비대, 삼총사 절약방"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value.slice(0, 16))}
                  maxLength={16}
                  className="feed-thread-input"
                  style={{ width: '100%', padding: '12px', background: 'var(--bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', color: 'var(--text-main)' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="pot-btn pot-btn-join"
                  onClick={handleCreateRoomSubmit}
                  disabled={!newRoomName.trim()}
                  style={{ flex: 1, padding: '12px', background: 'var(--primary)', color: '#fff', borderRadius: '12px', fontWeight: 700 }}
                >
                  개설 완료
                </button>
                <button
                  className="pot-btn pot-btn-cancel"
                  onClick={() => setShowCreateModal(false)}
                  style={{ flex: 1, padding: '12px', background: 'var(--bg)', color: 'var(--text-sub)', borderRadius: '12px' }}
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 4. 방 참여 모달 ── */}
      {showJoinModal && (
        <div className="story-modal-overlay" onClick={() => setShowJoinModal(false)}>
          <div className="story-modal-sheet glass-card" onClick={(e) => e.stopPropagation()}>
            <div className="story-modal-header">
              <h3 className="story-modal-name">초대 코드로 참여 <CustomIcon emoji="👥" /></h3>
              <p className="story-modal-label">공유받은 톡방 초대 코드를 입력해 일반 톡방에 합류합니다.</p>
            </div>
            <div className="story-modal-content" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="group-form-field">
                <label className="group-form-label" style={{ display: 'block', fontSize: '12px', color: 'var(--text-sub)', marginBottom: '6px' }}>초대 코드 (CHAT-XXXXXX)</label>
                <input
                  type="text"
                  placeholder="CHAT-XXXXXX"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="feed-thread-input"
                  style={{ width: '100%', padding: '12px', background: 'var(--bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', color: 'var(--text-main)' }}
                />
              </div>
              <div className="group-form-field" style={{ marginBottom: '8px' }}>
                <label className="group-form-label" style={{ display: 'block', fontSize: '12px', color: 'var(--text-sub)', marginBottom: '6px' }}>톡방 별칭 (선택)</label>
                <input
                  type="text"
                  placeholder="비워두면 기본 이름으로 등록됩니다."
                  value={joinRoomName}
                  onChange={(e) => setJoinRoomName(e.target.value.slice(0, 16))}
                  maxLength={16}
                  className="feed-thread-input"
                  style={{ width: '100%', padding: '12px', background: 'var(--bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', color: 'var(--text-main)' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="pot-btn pot-btn-join"
                  onClick={handleJoinRoomSubmit}
                  disabled={!joinCode.trim()}
                  style={{ flex: 1, padding: '12px', background: 'var(--primary)', color: '#fff', borderRadius: '12px', fontWeight: 700 }}
                >
                  참여 완료
                </button>
                <button
                  className="pot-btn pot-btn-cancel"
                  onClick={() => setShowJoinModal(false)}
                  style={{ flex: 1, padding: '12px', background: 'var(--bg)', color: 'var(--text-sub)', borderRadius: '12px' }}
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

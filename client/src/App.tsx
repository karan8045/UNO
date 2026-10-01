import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Card, PublicGameState, StandardColor } from '../../shared/types.ts';
import { validateCardPlay } from '../../shared/rules.ts';
import { CardView } from './components/CardView.tsx';
import { PenaltyBanner } from './components/PenaltyBanner.tsx';
import { ColorPickerModal } from './components/ColorPickerModal.tsx';
import { RulesGuideModal } from './components/RulesGuideModal.tsx';
import { soundManager } from './utils/audio.ts';

export const App: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRulesOpen, setIsRulesOpen] = useState<boolean>(false);
  const [pendingWildCard, setPendingWildCard] = useState<Card | null>(null);
  const [showLogDrawer, setShowLogDrawer] = useState<boolean>(false);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState<boolean>(false);
  const [roomModalTab, setRoomModalTab] = useState<'join' | 'create'>('join');
  const [createRoomCode, setCreateRoomCode] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [playerName, setPlayerName] = useState<string>(() => localStorage.getItem('uno_player_name') || 'Player');
  const [roomInput, setRoomInput] = useState<string>('');
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Initialize socket connection
  useEffect(() => {
    const s = io(window.location.origin);
    setSocket(s);

    s.on('connect', () => {
      console.log('Connected to server via socket:', s.id);
      // Check if URL has ?room=CODE
      const urlParams = new URLSearchParams(window.location.search);
      const roomParam = urlParams.get('room');
      const initialName = localStorage.getItem('uno_player_name') || 'Player';
      if (roomParam) {
        setRoomInput(roomParam.toUpperCase());
        s.emit('join_room', { roomCode: roomParam.toUpperCase(), playerName: initialName });
      } else {
        // Auto-start quick bot game on first connect
        s.emit('start_bot_game', { playerName: initialName });
      }
    });

    s.on('game_state', (state: PublicGameState) => {
      setGameState((prev) => {
        try {
          if (prev) {
            // Play audio effects based on state delta safely
            const currentPenalty = state.stackingChain?.accumulatedPenalty || 0;
            const prevPenalty = prev.stackingChain?.accumulatedPenalty || 0;
            if (state.stackingChain?.active && currentPenalty > prevPenalty) {
              soundManager.playStackSound(currentPenalty);
            } else if (prev.stackingChain?.active && !state.stackingChain?.active) {
              soundManager.playPenaltyDrawSound();
            } else if (state.topCard?.id && prev.topCard?.id && state.topCard.id !== prev.topCard.id) {
              soundManager.playCardSound();
            } else if (typeof state.deckCount === 'number' && typeof prev.deckCount === 'number' && state.deckCount < prev.deckCount) {
              soundManager.playDrawSound();
            }

            // Your turn chime
            const myId = state.myPlayerId || `player-${s.id}`;
            const isMeNow = state.currentTurnPlayerId === myId;
            const wasMe = prev.currentTurnPlayerId === (prev.myPlayerId || `player-${s.id}`);
            if (isMeNow && !wasMe && state.status === 'in_progress') {
              soundManager.playTurnSound();
            }

            // Victory fanfare
            if (state.status === 'game_over' && prev.status !== 'game_over') {
              soundManager.playWinSound();
            }
          }
        } catch (audioErr) {
          console.warn('Audio or state delta calculation ignored:', audioErr);
        }
        return state;
      });
      setErrorMessage(null); // Clear errors on state update
    });

    s.on('action_error', ({ message }: { message: string }) => {
      soundManager.playErrorSound();
      setErrorMessage(message);
      // Auto dismiss error after 5s
      setTimeout(() => setErrorMessage(null), 5000);
    });

    s.on('player_kicked', ({ message }: { message: string }) => {
      soundManager.playErrorSound();
      setErrorMessage(message || 'You were removed from the room by the host.');
      window.history.replaceState(null, '', window.location.pathname);
      const savedName = localStorage.getItem('uno_player_name') || 'Player';
      s.emit('start_bot_game', { playerName: savedName });
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [gameState?.log]);

  const handleStartBotGame = () => {
    if (!socket) return;
    window.history.replaceState(null, '', window.location.pathname);
    const finalName = playerName.trim() || 'Player';
    localStorage.setItem('uno_player_name', finalName);
    socket.emit('start_bot_game', { playerName: finalName });
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleCopyLink = (code: string) => {
    const inviteUrl = `${window.location.origin}/?room=${code}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleOpenRoomModal = (initialTab: 'join' | 'create' = 'join') => {
    setRoomModalTab(initialTab);
    if (!createRoomCode) {
      setCreateRoomCode('UNO-' + Math.floor(1000 + Math.random() * 9000));
    }
    setIsRoomModalOpen(true);
  };

  const handleCreateRoomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !createRoomCode.trim()) return;
    const code = createRoomCode.trim().toUpperCase();
    const finalName = playerName.trim() || 'Player 1';
    localStorage.setItem('uno_player_name', finalName);
    socket.emit('join_room', { roomCode: code, playerName: finalName });
    window.history.replaceState(null, '', `?room=${code}`);
    setRoomInput(code);
    setIsRoomModalOpen(false);
  };

  const handleJoinRoom = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!socket || !roomInput.trim()) return;
    const code = roomInput.trim().toUpperCase();
    const finalName = playerName.trim() || 'Player 1';
    localStorage.setItem('uno_player_name', finalName);
    socket.emit('join_room', { roomCode: code, playerName: finalName });
    window.history.replaceState(null, '', `?room=${code}`);
    setIsRoomModalOpen(false);
  };

  const handleAddBot = () => {
    if (!socket) return;
    socket.emit('add_bot');
  };

  const handleStartMultiplayerGame = () => {
    if (!socket) return;
    socket.emit('start_multiplayer_game');
  };

  const handleRemovePlayer = (targetPlayerId: string) => {
    if (!socket) return;
    socket.emit('remove_player', { targetPlayerId });
  };

  const handleCardClick = (card: Card) => {
    if (!gameState || !socket) return;

    // Check if card is wild and needs color picking
    if (card.color === 'wild') {
      setPendingWildCard(card);
      return;
    }

    // Play standard card directly
    socket.emit('play_card', { cardId: card.id });
  };

  const handleSelectColor = (color: StandardColor) => {
    if (!pendingWildCard || !socket) return;
    socket.emit('play_card', {
      cardId: pendingWildCard.id,
      declaredColor: color
    });
    setPendingWildCard(null);
  };

  const handleDrawCard = () => {
    if (!socket) return;
    socket.emit('draw_card');
  };

  const handlePassTurn = () => {
    if (!socket) return;
    socket.emit('pass_turn');
  };

  const handleRestartGame = () => {
    if (!socket) return;
    socket.emit('restart_game');
  };

  const handleLoadScenario = (scenario: string) => {
    if (!socket) return;
    socket.emit('load_scenario', { scenario });
  };

  // Helper to force an invalid card play to verify server-authoritative rejection
  const handleForceInvalidPlay = (card: Card) => {
    if (!socket) return;
    socket.emit('play_card', { cardId: card.id });
  };

  if (!gameState) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#090d14] text-white">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto shadow-[0_0_20px_rgba(255,94,40,0.4)]"></div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-300">Connecting to UNO Engine...</p>
        </div>
      </div>
    );
  }

  const myPlayerId = gameState.myPlayerId || `player-${socket?.id}`;
  const isMyTurn = gameState.currentTurnPlayerId === myPlayerId;
  const opponents = (gameState.players || []).filter(p => p.id !== myPlayerId);
  const myPlayer = (gameState.players || []).find(p => p.id === myPlayerId);
  const isHost = (gameState.players || [])[0]?.id === myPlayerId;
  const isCustomRoom = !gameState.id.startsWith('bot-game-');
  const stacking = gameState.stackingChain || {
    active: false,
    type: null,
    accumulatedPenalty: 0,
    chainLength: 0,
    history: []
  };

  return (
    <div className="min-h-screen flex flex-col justify-between p-2 sm:p-4 select-none relative overflow-hidden">
      {/* Modals */}
      <RulesGuideModal isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} />
      <ColorPickerModal
        isOpen={!!pendingWildCard}
        cardName={pendingWildCard?.value === 'wild_draw4' ? 'Wild Draw Four (+4)' : 'Wild Card'}
        onSelectColor={handleSelectColor}
        onCancel={() => setPendingWildCard(null)}
      />

      {/* Room Modal */}
      {/* Room Modal */}
      {isRoomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-[#0e1422]/95 backdrop-blur-2xl border border-white/10 rounded-[32px] p-7 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-lg text-brand-400">
                  🌐
                </div>
                <div>
                  <h3 className="text-xl font-black text-white tracking-tight uppercase">Multiplayer Room</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Real-time sync with custom room codes</p>
                </div>
              </div>
              <button
                onClick={() => setIsRoomModalOpen(false)}
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            {/* If currently in a custom multiplayer room, display quick info and copy buttons */}
            {isCustomRoom && (
              <div className="mb-4 p-4 bg-[#090d14] border border-white/10 rounded-2xl flex items-center justify-between gap-2 shadow-inner">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Current Room Code</span>
                  <span className="font-mono font-black text-brand-400 text-lg tracking-wider">{gameState.id}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleCopyCode(gameState.id)}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-200 rounded-xl text-xs font-bold border border-white/10 cursor-pointer transition"
                  >
                    {copiedCode ? '✓ Copied' : '📋 Code'}
                  </button>
                  <button
                    onClick={() => handleCopyLink(gameState.id)}
                    className="px-3 py-1.5 bg-brand-500 hover:bg-brand-400 text-white rounded-xl text-xs font-black cursor-pointer transition shadow-lg shadow-brand-500/25"
                  >
                    {copiedLink ? '✓ Copied' : '🔗 Link'}
                  </button>
                </div>
              </div>
            )}

            {/* Tab Selector */}
            <div className="flex rounded-2xl bg-white/5 p-1 mb-4 border border-white/10">
              <button
                type="button"
                onClick={() => setRoomModalTab('join')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  roomModalTab === 'join'
                    ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🔑 Join with Code
              </button>
              <button
                type="button"
                onClick={() => {
                  setRoomModalTab('create');
                  if (!createRoomCode) {
                    setCreateRoomCode('UNO-' + Math.floor(1000 + Math.random() * 9000));
                  }
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  roomModalTab === 'create'
                    ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🎲 Create Room
              </button>
            </div>

            {roomModalTab === 'join' ? (
              <form onSubmit={handleJoinRoom} className="space-y-4">
                <div>
                  <label className="text-xs text-slate-300 font-bold block mb-1.5">Your Nickname</label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={e => setPlayerName(e.target.value)}
                    className="w-full bg-[#090d14] border border-white/10 rounded-2xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500 transition-colors"
                    placeholder="Enter your nickname"
                    maxLength={20}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-bold block mb-1.5">Room Code</label>
                  <input
                    type="text"
                    value={roomInput}
                    onChange={e => setRoomInput(e.target.value.toUpperCase())}
                    className="w-full bg-[#090d14] border border-white/10 rounded-2xl px-3.5 py-2.5 text-sm text-white uppercase font-mono tracking-widest focus:outline-none focus:border-brand-500 transition-colors"
                    placeholder="e.g. UNO-4821"
                    maxLength={16}
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Ask the room host for their code to join their game.</p>
                </div>
                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsRoomModalOpen(false)}
                    className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-2xl text-xs font-bold border border-white/10 cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!roomInput.trim()}
                    className="flex-1 py-3 bg-brand-500 hover:bg-brand-400 disabled:opacity-40 text-white rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-xl shadow-brand-500/25 transition-transform active:scale-95"
                  >
                    Join Room
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCreateRoomSubmit} className="space-y-4">
                <div>
                  <label className="text-xs text-slate-300 font-bold block mb-1.5">Your Nickname</label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={e => setPlayerName(e.target.value)}
                    className="w-full bg-[#090d14] border border-white/10 rounded-2xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500 transition-colors"
                    placeholder="Enter your nickname"
                    maxLength={20}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-slate-300 font-bold">New Room Code</label>
                    <button
                      type="button"
                      onClick={() => setCreateRoomCode('UNO-' + Math.floor(1000 + Math.random() * 9000))}
                      className="text-[11px] text-brand-400 hover:underline cursor-pointer font-semibold"
                    >
                      🎲 Generate Random
                    </button>
                  </div>
                  <input
                    type="text"
                    value={createRoomCode}
                    onChange={e => setCreateRoomCode(e.target.value.toUpperCase())}
                    className="w-full bg-[#090d14] border border-white/10 rounded-2xl px-3.5 py-2.5 text-sm text-white uppercase font-mono tracking-widest focus:outline-none focus:border-brand-500 transition-colors"
                    placeholder="e.g. UNO-1234"
                    maxLength={16}
                  />
                  <p className="text-[11px] text-slate-500 mt-1">A waiting lobby will be created where you can invite friends.</p>
                </div>
                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsRoomModalOpen(false)}
                    className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-2xl text-xs font-bold border border-white/10 cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!createRoomCode.trim()}
                    className="flex-1 py-3 bg-brand-500 hover:bg-brand-400 disabled:opacity-40 text-white rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-xl shadow-brand-500/25 transition-transform active:scale-95"
                  >
                    Create & Enter Lobby
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Top Floating Pill Navbar (BioForge Style) */}
      <header className="glass-panel rounded-full px-4 sm:px-6 py-2.5 shadow-2xl flex items-center justify-between gap-3 border border-white/10 max-w-6xl mx-auto w-full my-2 relative z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30 flex items-center justify-center font-black text-sm shadow-[0_0_15px_rgba(255,94,40,0.35)]">
            ✦
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm tracking-tight text-white uppercase font-sans">UNO.STACK</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-slate-300 border border-white/10 font-bold uppercase tracking-wider">v2.4</span>
            </div>
            <p className="text-[10px] text-slate-400 hidden sm:block font-medium">Server-Authoritative Stacking Engine</p>
          </div>
        </div>

        {/* Center Navigation Links */}
        <div className="hidden md:flex items-center gap-1 text-xs font-semibold text-slate-300">
          <button
            onClick={() => setIsRulesOpen(true)}
            className="px-3.5 py-1.5 rounded-full hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
          >
            House Rules
          </button>
          <button
            onClick={() => handleOpenRoomModal('join')}
            className="px-3.5 py-1.5 rounded-full hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
          >
            {isCustomRoom ? `Room: ${gameState.id}` : 'Multiplayer Rooms'}
          </button>
          <button
            onClick={() => setShowLogDrawer(!showLogDrawer)}
            className="px-3.5 py-1.5 rounded-full hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
          >
            Activity Feed ({gameState.log.length})
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {isCustomRoom && (
            <button
              onClick={() => handleCopyCode(gameState.id)}
              title="Copy Room Code to clipboard"
              className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-200 border border-white/10 cursor-pointer transition hidden sm:flex items-center gap-1.5"
            >
              <span>{copiedCode ? '✓' : '📋'}</span>
              <span>{copiedCode ? 'Copied' : gameState.id}</span>
            </button>
          )}

          <button
            onClick={() => handleOpenRoomModal('join')}
            className="md:hidden px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 border border-white/10 cursor-pointer"
          >
            🌐 Room
          </button>

          <button
            onClick={handleStartBotGame}
            className="px-4 sm:px-5 py-2 rounded-full bg-brand-500 hover:bg-brand-400 text-white font-black text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-brand-500/25 transition active:scale-95"
          >
            Solo Match
          </button>

          <button
            onClick={() => {
              const next = !soundEnabled;
              soundManager.enabled = next;
              setSoundEnabled(next);
            }}
            title={soundEnabled ? 'Mute Sounds' : 'Unmute Sounds'}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold cursor-pointer transition-colors"
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>
        </div>
      </header>

      {/* Test Scenarios Quick Bar (BioForge Pill Strip) */}
      <div className="my-1.5 py-2 px-4 glass-panel rounded-2xl border border-white/5 flex items-center justify-between gap-2 flex-wrap text-xs max-w-6xl mx-auto w-full">
        <span className="font-extrabold text-brand-400 flex items-center gap-1.5 text-xs">
          <span>🧪</span> Quick Test Rules:
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => handleLoadScenario('chain_2_2_2')}
            className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-medium border border-white/10 cursor-pointer transition-colors text-[11px]"
            title="+2 -> +2 -> +2: Next player draws 6 if unable to continue"
          >
            +2 → +2 → +2 (Draw 6)
          </button>
          <button
            onClick={() => handleLoadScenario('chain_2_4')}
            className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-medium border border-white/10 cursor-pointer transition-colors text-[11px]"
            title="+2 -> +4: Penalty 6, player can play +4 only"
          >
            +2 → +4 (+4 Only)
          </button>
          <button
            onClick={() => handleLoadScenario('chain_2_2_4')}
            className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-medium border border-white/10 cursor-pointer transition-colors text-[11px]"
            title="+2 -> +2 -> +4: Penalty 8, player can play +4 only"
          >
            +2 → +2 → +4 (+8 Penalty)
          </button>
          <button
            onClick={() => handleLoadScenario('chain_4_4_4')}
            className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-medium border border-white/10 cursor-pointer transition-colors text-[11px]"
            title="+4 -> +4 -> +4: Next player draws 12 if unable to continue"
          >
            +4 → +4 → +4 (Draw 12)
          </button>
          <button
            onClick={() => handleLoadScenario('chain_4_reject_2')}
            className="px-2.5 py-1 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-medium border border-rose-500/30 cursor-pointer transition-colors text-[11px]"
            title="+4 -> +2: Test server rejection of +2 on a +4"
          >
            +4 → Try +2 (Test Reject)
          </button>
        </div>
      </div>

      {/* Server Error Alert Banner */}
      {errorMessage && (
        <div className="my-2 p-3 bg-red-950/90 border-2 border-red-500 text-red-100 rounded-xl text-center text-sm font-bold shadow-xl animate-bounce">
          <span className="mr-2">🛑</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {gameState.status === 'waiting' ? (
        <main className="flex-1 flex flex-col items-center justify-center p-4 max-w-xl mx-auto w-full text-center my-4">
          <div className="glass-card rounded-[32px] p-6 sm:p-9 w-full shadow-2xl border border-white/10 relative overflow-hidden">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-400 text-xs font-bold uppercase tracking-wider mb-3">
              <span className="w-2 h-2 rounded-full bg-brand-500 animate-ping"></span>
              Live Multiplayer Lobby
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight uppercase">Waiting For Players</h2>
            <p className="text-xs text-slate-400 mt-1 mb-5">
              Connect opponents with your room code or challenge AI bots
            </p>

            {/* Room Code Bento Card */}
            <div className="bg-[#090d14] border border-white/10 rounded-3xl p-5 mb-4 shadow-inner text-center">
              <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-2">
                Room Access Code
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <span className="font-mono text-2xl sm:text-3xl font-black text-white tracking-widest bg-white/5 px-6 py-2 rounded-2xl border border-white/10 select-all">
                  {gameState.id}
                </span>
                <button
                  onClick={() => handleCopyCode(gameState.id)}
                  className="px-5 py-2.5 bg-brand-500 hover:bg-brand-400 text-white rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-lg shadow-brand-500/25 transition active:scale-95"
                >
                  {copiedCode ? '✓ Copied' : '↗ Copy Code'}
                </button>
              </div>

              {/* Direct Link */}
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5 text-xs">
                <span className="text-slate-400 truncate flex-1 text-left font-mono text-[11px] px-2">
                  {window.location.origin}/?room={gameState.id}
                </span>
                <button
                  onClick={() => handleCopyLink(gameState.id)}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-200 rounded-xl font-bold cursor-pointer transition border border-white/10 text-[11px] whitespace-nowrap"
                >
                  {copiedLink ? '✓ Copied' : '🔗 Copy Link'}
                </button>
              </div>
            </div>

            {/* Connected Players List */}
            <div className="space-y-2 mb-6 text-left">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400 px-1 mb-2">
                <span>Roster ({gameState.players.length}/6 Players)</span>
                {gameState.players.length < 2 && (
                  <span className="text-brand-400 text-[11px] font-medium lowercase">min 2 required</span>
                )}
              </div>
              {gameState.players.map((p, idx) => (
                <div key={p.id} className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/10 text-sm">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{p.isBot ? '🤖' : '👤'}</span>
                    <span className="font-bold text-slate-100">{p.name}</span>
                    {p.id === myPlayerId && (
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 font-extrabold border border-sky-500/30">
                        YOU
                      </span>
                    )}
                    {idx === 0 && (
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-400 font-extrabold border border-brand-500/30">
                        HOST
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Ready
                    </span>
                    {isHost && p.id !== myPlayerId && (
                      <button
                        onClick={() => handleRemovePlayer(p.id)}
                        title={`Remove ${p.name}`}
                        className="text-[11px] px-2.5 py-1 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <span className="text-[10px]">✕</span> Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Lobby Actions */}
            {isHost ? (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleAddBot}
                    disabled={gameState.players.length >= 6}
                    className="flex-1 py-3.5 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-slate-200 font-bold rounded-2xl text-xs uppercase tracking-wider transition cursor-pointer border border-white/10"
                  >
                    + Add AI Bot
                  </button>
                  <button
                    onClick={handleStartMultiplayerGame}
                    disabled={gameState.players.length < 2}
                    className="flex-1 py-3.5 bg-brand-500 hover:bg-brand-400 disabled:opacity-40 text-white font-black rounded-2xl text-xs uppercase tracking-wider transition shadow-xl shadow-brand-500/30 cursor-pointer"
                  >
                    Start Match ({gameState.players.length} players)
                  </button>
                </div>
                {gameState.players.length < 2 && (
                  <p className="text-xs text-brand-400 font-medium text-center">
                    ⏳ Waiting for at least 1 more friend to join, or click "+ Add AI Bot".
                  </p>
                )}
              </div>
            ) : (
              <div className="p-5 rounded-2xl bg-[#090d14] border border-white/10 text-center space-y-1.5 shadow-inner">
                <div className="flex items-center justify-center gap-2 text-brand-400 font-extrabold text-xs uppercase tracking-wider">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-400 animate-ping"></span>
                  Waiting for host to start match...
                </div>
                <p className="text-xs text-slate-400">
                  Only the room host (<strong className="text-white">{gameState.players[0]?.name || 'Host'}</strong>) can launch the game.
                </p>
              </div>
            )}

            <div className="mt-5 pt-4 border-t border-white/5">
              <button
                onClick={handleStartBotGame}
                className="text-xs text-slate-400 hover:text-brand-400 underline cursor-pointer transition-colors"
              >
                Or leave room and play solo vs 3 bots
              </button>
            </div>
          </div>
        </main>
      ) : (
        <>
          {/* Opponents Area (Bento Style) */}
          <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 my-2 max-w-5xl mx-auto w-full">
            {opponents.map((opp, idx) => {
              const isOppTurn = opp.id === gameState.currentTurnPlayerId;
              return (
                <div
                  key={opp.id}
                  className={`p-3 rounded-2xl border transition-all text-center relative ${
                    isOppTurn
                      ? 'bg-[#151f30]/90 border-brand-500/60 ring-1 ring-brand-500/60 shadow-[0_0_20px_rgba(255,94,40,0.18)]'
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  {isOppTurn && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-brand-500 text-white text-[9px] font-black uppercase tracking-wider rounded-full shadow-lg shadow-brand-500/30">
                      Current Turn
                    </span>
                  )}
                  {isHost && (
                    <button
                      onClick={() => handleRemovePlayer(opp.id)}
                      title={`Kick ${opp.name}`}
                      className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center rounded-full text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 text-xs font-bold transition-colors cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                  <div className="flex items-center justify-center gap-1.5 mb-1.5 mt-0.5">
                    <span className="text-base">{idx === 0 ? '🤖' : idx === 1 ? '👾' : '🦾'}</span>
                    <span className="font-bold text-xs text-slate-100 truncate max-w-[120px]">{opp.name}</span>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                    <span className="w-4 h-6 rounded bg-rose-600 border border-white/20 inline-block shadow-sm"></span>
                    <span className="text-xs font-bold text-slate-300 font-mono">
                      {opp.cardCount} card{opp.cardCount !== 1 ? 's' : ''}
                    </span>
                    {opp.cardCount === 1 && (
                      <span className="animate-bounce px-1.5 py-0.5 bg-brand-500 text-white font-black text-[9px] rounded-full border border-brand-400/50 shadow-lg shadow-brand-500/30">
                        UNO!
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </section>

          {/* CENTER GAME TABLE (Titanium Glass Pedestal) */}
          <main className="flex-1 flex flex-col items-center justify-center my-3 relative w-full max-w-4xl mx-auto">
            {/* Prominent Draw Penalty Banner */}
            <PenaltyBanner
              stackingChain={stacking}
              isMyTurn={isMyTurn}
              onDrawPenalty={handleDrawCard}
            />

            {/* Center Playfield Pedestal */}
            <div className="glass-card rounded-[36px] p-6 sm:p-8 border border-white/10 shadow-2xl relative w-full max-w-xl mx-auto flex flex-col items-center justify-center my-2">
              <div className="absolute inset-0 bg-gradient-to-b from-brand-500/5 via-transparent to-transparent pointer-events-none rounded-[36px]" />

              <div className="flex items-center justify-center gap-8 sm:gap-12 my-2 flex-wrap relative z-10">
                {/* Draw Pile */}
                <div className="flex flex-col items-center gap-2.5">
                  <div
                    onClick={isMyTurn ? handleDrawCard : undefined}
                    className={`
                      relative w-24 h-36 sm:w-28 sm:h-40 rounded-2xl bg-gradient-to-tr from-[#0a0f18] to-[#162032] border-2 border-white/15 shadow-2xl flex flex-col items-center justify-center transition-all
                      ${isMyTurn ? 'cursor-pointer hover:scale-105 hover:border-brand-500 hover:shadow-brand-500/30' : 'cursor-default opacity-85'}
                    `}
                  >
                    <div className="w-16 h-24 rounded-xl bg-gradient-to-br from-rose-600 to-rose-800 border border-white/20 flex items-center justify-center shadow-inner">
                      <span className="font-black text-amber-300 text-sm italic tracking-tighter">UNO</span>
                    </div>
                    <span className="absolute bottom-2 text-[10px] font-extrabold text-slate-300 uppercase tracking-wider bg-black/60 px-2 py-0.5 rounded-full border border-white/10 font-mono">
                      {gameState.deckCount} left
                    </span>
                  </div>
                  <button
                    onClick={handleDrawCard}
                    disabled={!isMyTurn}
                    className={`px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition ${
                      isMyTurn
                        ? stacking.active
                          ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 cursor-pointer'
                          : 'bg-brand-500 hover:bg-brand-400 text-white shadow-lg shadow-brand-500/30 cursor-pointer'
                        : 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5'
                    }`}
                  >
                    {stacking.active ? `Draw +${stacking.accumulatedPenalty}` : 'Draw Card'}
                  </button>
                </div>

                {/* Active Discard Pile */}
                <div className="flex flex-col items-center gap-2.5">
                  <div className="relative">
                    {gameState.topCard ? (
                      <CardView card={gameState.topCard} isTopCard={true} size="md" isPlayable={false} />
                    ) : (
                      <div className="w-24 h-36 rounded-2xl border border-dashed border-white/20 bg-white/5 flex items-center justify-center text-xs text-slate-500 font-bold">
                        No Card
                      </div>
                    )}
                  </div>

                  {/* Declared Color Indicator */}
                  {gameState.topCard && (
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-bold">
                      <span className="text-slate-400 text-[10px] uppercase tracking-wider">Active Color:</span>
                      <span
                        className={`w-3 h-3 rounded-full shadow ${
                          gameState.currentDeclaredColor === 'red'
                            ? 'bg-rose-500 ring-2 ring-rose-400/50 shadow-rose-500/50'
                            : gameState.currentDeclaredColor === 'blue'
                            ? 'bg-sky-500 ring-2 ring-sky-400/50 shadow-sky-500/50'
                            : gameState.currentDeclaredColor === 'green'
                            ? 'bg-emerald-500 ring-2 ring-emerald-400/50 shadow-emerald-500/50'
                            : 'bg-amber-400 ring-2 ring-amber-300/50 shadow-amber-400/50'
                        }`}
                      />
                      <span className="uppercase text-[11px] text-white font-extrabold">{gameState.currentDeclaredColor || 'red'}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>

          {/* BOTTOM: Human Player Area (Glass Dock) */}
          <footer className="w-full max-w-5xl mx-auto flex flex-col items-center mt-auto">
            {/* Turn Status & Controls Bar */}
            <div className="w-full flex items-center justify-between px-4 py-2 mb-2 glass-panel rounded-2xl border border-white/10 gap-3 flex-wrap shadow-xl">
              <div className="flex items-center gap-2.5">
                <span className={`w-2.5 h-2.5 rounded-full ${isMyTurn ? 'bg-brand-500 animate-ping' : 'bg-slate-600'}`}></span>
                <span className="font-extrabold text-xs uppercase tracking-wider text-white font-sans">
                  {isMyTurn ? '👉 YOUR TURN TO PLAY' : `Waiting for ${(gameState.players || []).find(p => p.id === gameState.currentTurnPlayerId)?.name || 'Next Player'}...`}
                </span>
                {stacking.active && isMyTurn && (
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-500/30">
                    Facing +{stacking.accumulatedPenalty} Penalty
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handlePassTurn}
                  disabled={!isMyTurn || stacking.active}
                  title={stacking.active ? 'Cannot pass during penalty chain' : 'Pass turn'}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition ${
                    isMyTurn && !stacking.active
                      ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10 cursor-pointer'
                      : 'bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed'
                  }`}
                >
                  Pass Turn
                </button>

                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <span>{myPlayer?.name || 'You'}:</span>
                  <span className="font-bold text-white font-mono bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
                    {(gameState.myHand || []).length} cards
                  </span>
                  {(gameState.myHand || []).length === 1 && (
                    <span className="animate-bounce px-2 py-0.5 bg-brand-500 text-white font-black text-[10px] rounded-full border border-brand-400/50 shadow-lg shadow-brand-500/30">
                      UNO!
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Player Hand Cards Rack */}
            <div className="w-full overflow-x-auto pb-4 pt-2 px-2 flex justify-start sm:justify-center items-end gap-2.5 scroll-smooth">
              {(gameState.myHand || []).map((card) => {
                const validation = isMyTurn && gameState.topCard
                  ? validateCardPlay(card, gameState.topCard, gameState.currentDeclaredColor || 'red', stacking)
                  : { valid: false, reason: isMyTurn ? 'Waiting for card' : 'Not your turn' };

                const isCardDisabled = isMyTurn ? !validation.valid : false;

                return (
                  <div key={card.id} className="relative group">
                    <CardView
                      card={card}
                      isPlayable={isMyTurn && validation.valid}
                      isDisabled={isCardDisabled}
                      disabledReason={validation.reason}
                      onClick={() => handleCardClick(card)}
                      size="md"
                    />

                    {/* Debug / Verification button */}
                    {isCardDisabled && isMyTurn && (
                      <button
                        onClick={() => handleForceInvalidPlay(card)}
                        title="Click to send this move to server and verify server rejection"
                        className="absolute -top-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-rose-600 hover:bg-rose-500 text-[10px] text-white font-extrabold px-2 py-0.5 rounded-md shadow-lg z-30 whitespace-nowrap cursor-pointer"
                      >
                        Force Send (Test Reject)
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </footer>
        </>
      )}

      {/* Game Over Screen (BioForge Modal) */}
      {gameState.status === 'game_over' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-[#0e1422]/95 backdrop-blur-2xl border border-white/10 rounded-[36px] p-8 max-w-md w-full text-center shadow-2xl">
            <div className="w-16 h-16 rounded-3xl bg-brand-500/10 border border-brand-500/20 mx-auto flex items-center justify-center text-3xl mb-4 shadow-inner">
              🏆
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight uppercase">Match Completed</h2>
            <p className="text-sm text-slate-300 mt-1">
              Winner: <strong className="text-brand-400 font-extrabold text-lg">{gameState.winner?.name}</strong>
            </p>
            <p className="text-xs text-slate-500 mt-2">All hand cards emptied under authoritative house rules</p>

            <button
              onClick={handleRestartGame}
              className="mt-6 px-8 py-3.5 bg-brand-500 hover:bg-brand-400 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-brand-500/30 cursor-pointer transition-transform active:scale-95"
            >
              Play Rematch
            </button>
          </div>
        </div>
      )}

      {/* Game Log Drawer */}
      {showLogDrawer && (
        <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-88 bg-[#0a0f18]/95 border-l border-white/10 p-5 shadow-2xl flex flex-col backdrop-blur-2xl">
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <h3 className="font-extrabold text-sm text-white flex items-center gap-2 uppercase tracking-wider">
              <span>📋</span> Game Action Feed
            </h3>
            <button
              onClick={() => setShowLogDrawer(false)}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white text-xs font-bold cursor-pointer transition-colors"
            >
              ✕
            </button>
          </div>

          <div ref={logContainerRef} className="flex-1 overflow-y-auto my-3 space-y-2 pr-1 text-xs">
            {gameState.log.map((entry) => (
              <div
                key={entry.id}
                className={`p-3 rounded-2xl border leading-relaxed ${
                  entry.type === 'stack'
                    ? 'bg-brand-500/10 border-brand-500/30 text-brand-200 font-bold'
                    : entry.type === 'error'
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-200 font-semibold'
                    : entry.type === 'win'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200 font-bold'
                    : 'bg-white/5 border-white/5 text-slate-300'
                }`}
              >
                <div className="text-[10px] text-slate-500 mb-0.5 font-mono">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </div>
                <div>{entry.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

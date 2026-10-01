import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Card, PublicGameState, StandardColor } from '../../shared/types.ts';
import { validateCardPlay } from '../../shared/rules.ts';
import { CardView } from './components/CardView.tsx';
import { PenaltyBanner } from './components/PenaltyBanner.tsx';
import { ColorPickerModal } from './components/ColorPickerModal.tsx';
import { RulesGuideModal } from './components/RulesGuideModal.tsx';

export const App: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRulesOpen, setIsRulesOpen] = useState<boolean>(false);
  const [pendingWildCard, setPendingWildCard] = useState<Card | null>(null);
  const [showLogDrawer, setShowLogDrawer] = useState<boolean>(false);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState<boolean>(false);
  const [playerName, setPlayerName] = useState<string>('Player 1');
  const [roomInput, setRoomInput] = useState<string>('');
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Initialize socket connection
  useEffect(() => {
    const s = io(window.location.origin);
    setSocket(s);

    s.on('connect', () => {
      console.log('Connected to server via socket:', s.id);
      // Auto-start quick bot game on first connect
      s.emit('start_bot_game', { playerName: 'You' });
    });

    s.on('game_state', (state: PublicGameState) => {
      setGameState(state);
      setErrorMessage(null); // Clear errors on state update
    });

    s.on('action_error', ({ message }: { message: string }) => {
      setErrorMessage(message);
      // Auto dismiss error after 5s
      setTimeout(() => setErrorMessage(null), 5000);
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
    socket.emit('start_bot_game', { playerName });
  };

  const handleJoinRoom = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!socket || !roomInput.trim()) return;
    socket.emit('join_room', { roomCode: roomInput.trim(), playerName });
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
      <div className="flex h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xl font-bold tracking-wide">Connecting to UNO Engine...</p>
        </div>
      </div>
    );
  }

  const isMyTurn = gameState.currentTurnPlayerId.includes(socket?.id || '') || gameState.players[0]?.id === gameState.currentTurnPlayerId;
  const opponents = gameState.players.slice(1);
  const stacking = gameState.stackingChain;

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
      {isRoomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-xl font-black text-amber-400">Join or Create Room</h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">Play with friends or test multiplayer across tabs</p>
            <form onSubmit={handleJoinRoom} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 font-bold block mb-1">Your Name</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  placeholder="Player 1"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300 font-bold block mb-1">Room Code</label>
                <input
                  type="text"
                  value={roomInput}
                  onChange={e => setRoomInput(e.target.value.toUpperCase())}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white uppercase font-mono tracking-widest focus:outline-none focus:border-amber-400"
                  placeholder="e.g. ROOM-101"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRoomModalOpen(false)}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!roomInput.trim()}
                  className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow"
                >
                  Join Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Top Navbar */}
      <header className="flex items-center justify-between pb-3 border-b border-slate-800 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 via-amber-500 to-blue-600 flex items-center justify-center font-black text-xl shadow-lg shadow-amber-500/20">
            U
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2">
              UNO Stacking Rules
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-wider font-extrabold">
                Server Authoritative
              </span>
            </h1>
            <p className="text-xs text-slate-400">Custom House Rule: +2 & +4 Stacking Chains</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsRulesOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-amber-400 border border-amber-400/30 flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <span>📜</span>
            <span>House Rules</span>
          </button>

          <button
            onClick={() => setIsRoomModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-sky-400 border border-sky-400/30 flex items-center gap-1 cursor-pointer"
          >
            <span>🌐</span>
            <span>Room: {gameState.id.length > 10 ? gameState.id.substring(0, 10) + '...' : gameState.id}</span>
          </button>

          <button
            onClick={handleStartBotGame}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider cursor-pointer shadow-md transition-colors"
          >
            New Game (3 Bots)
          </button>

          <button
            onClick={() => setShowLogDrawer(!showLogDrawer)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 border border-slate-700 flex items-center gap-1 cursor-pointer"
          >
            <span>📋</span>
            <span>Logs ({gameState.log.length})</span>
          </button>
        </div>
      </header>

      {/* Test Scenarios Quick Bar */}
      <div className="my-2 py-2 px-3 bg-slate-800/70 rounded-xl border border-slate-700/80 flex items-center justify-between gap-2 flex-wrap text-xs">
        <span className="font-extrabold text-amber-400 flex items-center gap-1.5">
          <span className="text-base">🧪</span> Quick Test Rules:
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => handleLoadScenario('chain_2_2_2')}
            className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold border border-slate-500/50 cursor-pointer transition-colors"
            title="+2 -> +2 -> +2: Next player draws 6 if unable to continue"
          >
            +2 → +2 → +2 (Draw 6)
          </button>
          <button
            onClick={() => handleLoadScenario('chain_2_4')}
            className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold border border-slate-500/50 cursor-pointer transition-colors"
            title="+2 -> +4: Penalty 6, player can play +4 only"
          >
            +2 → +4 (+4 Only)
          </button>
          <button
            onClick={() => handleLoadScenario('chain_2_2_4')}
            className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold border border-slate-500/50 cursor-pointer transition-colors"
            title="+2 -> +2 -> +4: Penalty 8, player can play +4 only"
          >
            +2 → +2 → +4 (+8 Penalty)
          </button>
          <button
            onClick={() => handleLoadScenario('chain_4_4_4')}
            className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold border border-slate-500/50 cursor-pointer transition-colors"
            title="+4 -> +4 -> +4: Next player draws 12 if unable to continue"
          >
            +4 → +4 → +4 (Draw 12)
          </button>
          <button
            onClick={() => handleLoadScenario('chain_4_reject_2')}
            className="px-2.5 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-200 font-bold border border-rose-500/60 cursor-pointer transition-colors"
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
        <main className="flex-1 flex flex-col items-center justify-center p-4 max-w-lg mx-auto w-full text-center">
          <div className="bg-slate-800/90 border-2 border-slate-700 rounded-3xl p-6 sm:p-8 w-full shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center text-2xl mx-auto mb-3">
              🎮
            </div>
            <h2 className="text-2xl font-black text-amber-400">Room: {gameState.id}</h2>
            <p className="text-xs text-slate-400 mt-1 mb-6">
              Share room code <strong className="text-white bg-slate-900 px-2 py-0.5 rounded font-mono text-sm">{gameState.id}</strong> with friends to play together!
            </p>

            <div className="space-y-2 mb-6">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 text-left">
                Players in Room ({gameState.players.length}/6):
              </div>
              {gameState.players.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-700 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{p.isBot ? '🤖' : '👤'}</span>
                    <span className="font-bold text-slate-200">{p.name}</span>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                    Ready
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleAddBot}
                disabled={gameState.players.length >= 6}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 font-bold rounded-xl text-sm transition cursor-pointer"
              >
                + Add AI Bot
              </button>
              <button
                onClick={handleStartMultiplayerGame}
                disabled={gameState.players.length < 2}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black rounded-xl text-sm transition shadow-lg cursor-pointer"
              >
                Start Game ({gameState.players.length} players)
              </button>
            </div>
          </div>
        </main>
      ) : (
        <>
          {/* Opponents Area */}
          <section className="grid grid-cols-3 gap-2 my-2 max-w-4xl mx-auto w-full">
        {opponents.map((opp, idx) => {
          const isOppTurn = opp.id === gameState.currentTurnPlayerId;
          return (
            <div
              key={opp.id}
              className={`p-3 rounded-2xl border transition-all text-center relative ${
                isOppTurn
                  ? 'bg-amber-500/10 border-amber-400 ring-2 ring-amber-400/50 shadow-lg shadow-amber-500/20'
                  : 'bg-slate-800/60 border-slate-700/60'
              }`}
            >
              {isOppTurn && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-amber-500 text-slate-950 text-[10px] font-black uppercase rounded-full shadow">
                  Current Turn
                </span>
              )}
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <span className="text-lg">{idx === 0 ? '🤖' : idx === 1 ? '👾' : '🦾'}</span>
                <span className="font-extrabold text-sm text-slate-100">{opp.name}</span>
              </div>
              <div className="flex items-center justify-center gap-1">
                <span className="w-5 h-7 rounded bg-red-600 border border-white/20 inline-block shadow-sm"></span>
                <span className="text-xs font-bold text-slate-300">
                  {opp.cardCount} card{opp.cardCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          );
        })}
      </section>

      {/* CENTER GAME TABLE */}
      <main className="flex-1 flex flex-col items-center justify-center my-2 relative">
        {/* Prominent Draw Penalty Banner */}
        <PenaltyBanner
          stackingChain={stacking}
          isMyTurn={isMyTurn}
          onDrawPenalty={handleDrawCard}
        />

        {/* Center Card Playfield */}
        <div className="flex items-center justify-center gap-6 sm:gap-10 my-4 flex-wrap">
          {/* Draw Pile */}
          <div className="flex flex-col items-center gap-2">
            <div
              onClick={isMyTurn ? handleDrawCard : undefined}
              className={`
                relative w-24 h-36 sm:w-28 sm:h-40 rounded-xl bg-gradient-to-tr from-slate-950 to-slate-800 border-2 border-slate-600 shadow-2xl flex flex-col items-center justify-center transition-transform
                ${isMyTurn ? 'cursor-pointer hover:scale-105 hover:border-amber-400 hover:shadow-amber-500/20' : 'cursor-default opacity-80'}
              `}
            >
              <div className="w-16 h-24 rounded-lg bg-red-700 border border-white/20 flex items-center justify-center shadow-inner">
                <span className="font-black text-amber-400 text-sm italic tracking-tighter">UNO</span>
              </div>
              <span className="absolute bottom-1.5 text-[10px] font-extrabold text-slate-400">
                {gameState.deckCount} left
              </span>
            </div>
            <button
              onClick={handleDrawCard}
              disabled={!isMyTurn}
              className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${
                isMyTurn
                  ? stacking.active
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow cursor-pointer'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {stacking.active ? `Draw +${stacking.accumulatedPenalty}` : 'Draw Card'}
            </button>
          </div>

          {/* Active Discard Pile */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <CardView card={gameState.topCard} isTopCard={true} size="md" isPlayable={false} />
            </div>

            {/* Declared Color Indicator */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs font-bold">
              <span className="text-slate-400">Active Color:</span>
              <span
                className={`w-3 h-3 rounded-full shadow ${
                  gameState.currentDeclaredColor === 'red'
                    ? 'bg-red-500 ring-2 ring-red-400/50'
                    : gameState.currentDeclaredColor === 'blue'
                    ? 'bg-blue-500 ring-2 ring-blue-400/50'
                    : gameState.currentDeclaredColor === 'green'
                    ? 'bg-emerald-500 ring-2 ring-emerald-400/50'
                    : 'bg-amber-400 ring-2 ring-amber-300/50'
                }`}
              />
              <span className="uppercase text-[11px] text-white font-extrabold">{gameState.currentDeclaredColor}</span>
            </div>
          </div>
        </div>
      </main>

      {/* BOTTOM: Human Player Area */}
      <footer className="w-full max-w-4xl mx-auto flex flex-col items-center">
        {/* Turn Status & Controls Bar */}
        <div className="w-full flex items-center justify-between px-3 py-1.5 mb-2 bg-slate-800/80 rounded-xl border border-slate-700/60 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${isMyTurn ? 'bg-emerald-500 animate-ping' : 'bg-slate-600'}`}></span>
            <span className="font-extrabold text-sm text-white">
              {isMyTurn ? '👉 YOUR TURN!' : `Waiting for ${gameState.players.find(p => p.id === gameState.currentTurnPlayerId)?.name}...`}
            </span>
            {stacking.active && isMyTurn && (
              <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-xs font-bold border border-red-500/30">
                Facing +{stacking.accumulatedPenalty} Penalty
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePassTurn}
              disabled={!isMyTurn || stacking.active}
              title={stacking.active ? 'Cannot pass during penalty chain' : 'Pass turn'}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                isMyTurn && !stacking.active
                  ? 'bg-slate-700 hover:bg-slate-600 text-white cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              Pass Turn
            </button>

            <span className="text-xs text-slate-400">
              Cards in hand: <strong className="text-white">{gameState.myHand.length}</strong>
            </span>
          </div>
        </div>

        {/* Player Hand Cards */}
        <div className="w-full overflow-x-auto pb-4 pt-2 px-2 flex justify-start sm:justify-center items-end gap-2 scroll-smooth">
          {gameState.myHand.map((card) => {
            const validation = isMyTurn
              ? validateCardPlay(card, gameState.topCard, gameState.currentDeclaredColor, stacking)
              : { valid: false, reason: 'Not your turn' };

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

                {/* Debug / Verification button: Attempt invalid card to verify authoritative server rejection */}
                {isCardDisabled && isMyTurn && (
                  <button
                    onClick={() => handleForceInvalidPlay(card)}
                    title="Click to send this move to server and verify server rejection"
                    className="absolute -top-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-red-600 hover:bg-red-500 text-[10px] text-white font-extrabold px-1.5 py-0.5 rounded shadow z-30 whitespace-nowrap cursor-pointer"
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

      {/* Game Over Screen */}
      {gameState.status === 'game_over' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-slate-900 border-2 border-amber-400 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
            <span className="text-5xl">🏆</span>
            <h2 className="text-3xl font-black text-amber-400 mt-2">Game Over!</h2>
            <p className="text-lg text-slate-200 mt-1">
              Winner: <strong className="text-white text-xl">{gameState.winner?.name}</strong>
            </p>
            <p className="text-xs text-slate-400 mt-2">All cards emptied!</p>

            <button
              onClick={handleRestartGame}
              className="mt-6 px-8 py-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-base rounded-2xl shadow-xl cursor-pointer transition-transform active:scale-95"
            >
              Play Rematch
            </button>
          </div>
        </div>
      )}

      {/* Game Log Drawer */}
      {showLogDrawer && (
        <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-80 bg-slate-900/95 border-l border-slate-700 p-4 shadow-2xl flex flex-col backdrop-blur-md">
          <div className="flex items-center justify-between pb-3 border-b border-slate-700">
            <h3 className="font-extrabold text-sm text-slate-100 flex items-center gap-2">
              <span>📋</span> Game Action Feed
            </h3>
            <button
              onClick={() => setShowLogDrawer(false)}
              className="w-6 h-6 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div ref={logContainerRef} className="flex-1 overflow-y-auto my-3 space-y-2 pr-1 text-xs">
            {gameState.log.map((entry) => (
              <div
                key={entry.id}
                className={`p-2 rounded-xl border leading-relaxed ${
                  entry.type === 'stack'
                    ? 'bg-amber-950/60 border-amber-500/40 text-amber-200 font-bold'
                    : entry.type === 'error'
                    ? 'bg-red-950/60 border-red-500/40 text-red-200 font-semibold'
                    : entry.type === 'win'
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200 font-bold'
                    : 'bg-slate-800/40 border-slate-700/40 text-slate-300'
                }`}
              >
                <div className="text-[10px] text-slate-400 mb-0.5">
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

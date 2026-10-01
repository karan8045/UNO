import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { UnoGame } from './game/unoGame.ts';
import type { StandardColor } from '../shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(express.json());

// Store active games
const games = new Map<string, UnoGame>();
// Track socket to game/player mapping
const socketToPlayer = new Map<string, { gameId: string; playerId: string }>();

// Serve built frontend assets if they exist
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', activeGames: games.size });
});

function broadcastGameState(gameId: string) {
  const game = games.get(gameId);
  if (!game) return;

  // Send personalized state to each socket in the game
  const room = io.sockets.adapter.rooms.get(gameId);
  if (room) {
    for (const socketId of room) {
      const mapping = socketToPlayer.get(socketId);
      const socket = io.sockets.sockets.get(socketId);
      if (socket && mapping && mapping.gameId === gameId) {
        socket.emit('game_state', game.getPublicState(mapping.playerId));
      }
    }
  }

  // Handle bot turns if current player is bot
  triggerBotTurnIfNeeded(gameId);
}

function triggerBotTurnIfNeeded(gameId: string) {
  const game = games.get(gameId);
  if (!game || game.status !== 'in_progress') return;

  const current = game.getCurrentPlayer();
  if (current && current.isBot) {
    setTimeout(() => {
      // Re-verify game and turn hasn't changed
      const currentGame = games.get(gameId);
      if (!currentGame || currentGame.status !== 'in_progress') return;
      if (currentGame.getCurrentPlayer()?.id !== current.id) return;

      const botResult = currentGame.playBotTurn();
      if (botResult.acted) {
        broadcastGameState(gameId);
      }
    }, 750);
  }
}

io.on('connection', (socket: Socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Create Quick Single-Player Game vs 3 Bots
  socket.on('start_bot_game', ({ playerName }: { playerName?: string }) => {
    // Leave previous room if any
    const prevMapping = socketToPlayer.get(socket.id);
    if (prevMapping) {
      socket.leave(prevMapping.gameId);
      const prevGame = games.get(prevMapping.gameId);
      if (prevGame && prevGame.status === 'waiting') {
        prevGame.removePlayer(prevMapping.playerId);
        broadcastGameState(prevMapping.gameId);
      }
    }

    const gameId = `bot-game-${socket.id.substring(0, 6)}`;
    const humanId = `player-${socket.id}`;
    const humanName = playerName?.trim() || 'Player 1';

    const game = new UnoGame({ id: gameId });
    game.addPlayer(humanId, humanName, false);
    game.addPlayer('bot-alice', 'Alice (Bot)', true);
    game.addPlayer('bot-bob', 'Bob (Bot)', true);
    game.addPlayer('bot-charlie', 'Charlie (Bot)', true);

    game.startGame(7);
    games.set(gameId, game);

    socket.join(gameId);
    socketToPlayer.set(socket.id, { gameId, playerId: humanId });

    socket.emit('game_joined', { gameId, playerId: humanId });
    socket.emit('game_state', game.getPublicState(humanId));
    broadcastGameState(gameId);
  });

  // Create or join a multiplayer room
  socket.on('join_room', ({ roomCode, playerName }: { roomCode: string; playerName: string }) => {
    const gameId = roomCode.trim().toUpperCase();
    if (!gameId) {
      socket.emit('action_error', { message: 'Room code cannot be empty.' });
      return;
    }

    // Leave previous room if switching
    const prevMapping = socketToPlayer.get(socket.id);
    if (prevMapping && prevMapping.gameId !== gameId) {
      socket.leave(prevMapping.gameId);
      const prevGame = games.get(prevMapping.gameId);
      if (prevGame && prevGame.status === 'waiting') {
        prevGame.removePlayer(prevMapping.playerId);
        broadcastGameState(prevMapping.gameId);
      }
    }

    let game = games.get(gameId);
    if (!game) {
      game = new UnoGame({ id: gameId });
      games.set(gameId, game);
    }

    const playerId = `player-${socket.id}`;
    const name = playerName?.trim() || `Player ${game.players.length + 1}`;

    if (game.status === 'waiting') {
      if (game.players.length >= 6) {
        socket.emit('action_error', { message: 'Room is full (maximum 6 players).' });
        return;
      }
      if (!game.players.some(p => p.id === playerId)) {
        game.addPlayer(playerId, name, false);
      }
      socket.join(gameId);
      socketToPlayer.set(socket.id, { gameId, playerId });
      socket.emit('game_joined', { gameId, playerId });
      socket.emit('game_state', game.getPublicState(playerId));
    } else {
      // In progress or game over: check reconnection or spectator
      const existing = game.players.find(p => p.name.toLowerCase() === name.toLowerCase() && !p.isBot);
      if (existing) {
        socket.join(gameId);
        socketToPlayer.set(socket.id, { gameId, playerId: existing.id });
        socket.emit('game_joined', { gameId, playerId: existing.id });
        socket.emit('game_state', game.getPublicState(existing.id));
        game.addLog(`Player ${existing.name} reconnected.`, 'info');
      } else {
        // Allow spectating
        socket.join(gameId);
        socketToPlayer.set(socket.id, { gameId, playerId });
        socket.emit('game_joined', { gameId, playerId });
        socket.emit('game_state', game.getPublicState(playerId));
      }
    }

    broadcastGameState(gameId);
  });

  // Start multiplayer game in room
  socket.on('start_multiplayer_game', () => {
    const mapping = socketToPlayer.get(socket.id);
    if (!mapping) return;
    const game = games.get(mapping.gameId);
    if (!game) return;

    if (game.status === 'waiting' && game.players.length >= 2) {
      game.startGame(7);
      broadcastGameState(mapping.gameId);
    } else if (game.players.length < 2) {
      socket.emit('action_error', { message: 'Need at least 2 players to start game.' });
    }
  });

  // Add bot to waiting room
  socket.on('add_bot', () => {
    const mapping = socketToPlayer.get(socket.id);
    if (!mapping) return;
    const game = games.get(mapping.gameId);
    if (!game || game.status !== 'waiting') return;

    if (game.players.length >= 6) {
      socket.emit('action_error', { message: 'Maximum 6 players per room.' });
      return;
    }

    const botCount = game.players.filter(p => p.isBot).length + 1;
    const botNames = ['Alice (Bot)', 'Bob (Bot)', 'Charlie (Bot)', 'David (Bot)', 'Emma (Bot)'];
    const botName = botNames[botCount - 1] || `Bot ${botCount}`;
    game.addPlayer(`bot-${Date.now()}-${botCount}`, botName, true);
    broadcastGameState(mapping.gameId);
  });

  // Play a card
  socket.on('play_card', ({ cardId, declaredColor }: { cardId: string; declaredColor?: StandardColor }) => {
    const mapping = socketToPlayer.get(socket.id);
    if (!mapping) {
      socket.emit('action_error', { message: 'You are not connected to a game.' });
      return;
    }

    const game = games.get(mapping.gameId);
    if (!game) {
      socket.emit('action_error', { message: 'Game session not found.' });
      return;
    }

    const result = game.playCard(mapping.playerId, cardId, declaredColor);
    if (!result.success) {
      // Server-authoritative rejection
      socket.emit('action_error', { message: result.error || 'Invalid move.' });
      return;
    }

    broadcastGameState(mapping.gameId);
  });

  // Draw card (or penalty)
  socket.on('draw_card', () => {
    const mapping = socketToPlayer.get(socket.id);
    if (!mapping) return;
    const game = games.get(mapping.gameId);
    if (!game) return;

    const result = game.drawCard(mapping.playerId);
    if (!result.success) {
      socket.emit('action_error', { message: result.error || 'Cannot draw card.' });
      return;
    }

    broadcastGameState(mapping.gameId);
  });

  // Pass turn (only allowed after drawing when no chain active)
  socket.on('pass_turn', () => {
    const mapping = socketToPlayer.get(socket.id);
    if (!mapping) return;
    const game = games.get(mapping.gameId);
    if (!game) return;

    const result = game.passTurn(mapping.playerId);
    if (!result.success) {
      socket.emit('action_error', { message: result.error || 'Cannot pass turn.' });
      return;
    }

    broadcastGameState(mapping.gameId);
  });

  // Load preset scenario for interactive testing
  socket.on('load_scenario', ({ scenario }: { scenario: string }) => {
    const mapping = socketToPlayer.get(socket.id);
    if (!mapping) return;
    const game = games.get(mapping.gameId);
    if (!game) return;

    const ok = game.loadScenario(scenario, mapping.playerId);
    if (ok) {
      broadcastGameState(mapping.gameId);
    }
  });

  // Restart / Rematch
  socket.on('restart_game', () => {
    const mapping = socketToPlayer.get(socket.id);
    if (!mapping) return;
    const game = games.get(mapping.gameId);
    if (!game) return;

    // Reset deck and hands with current players
    const currentPlayers = game.players.map(p => ({ id: p.id, name: p.name, isBot: p.isBot }));
    const newGame = new UnoGame({ id: game.id, initialPlayers: currentPlayers });
    newGame.startGame(7);
    games.set(game.id, newGame);

    broadcastGameState(game.id);
  });

  // Explicit leave room
  socket.on('leave_room', () => {
    const mapping = socketToPlayer.get(socket.id);
    if (mapping) {
      socket.leave(mapping.gameId);
      const game = games.get(mapping.gameId);
      if (game && game.status === 'waiting') {
        game.removePlayer(mapping.playerId);
        broadcastGameState(mapping.gameId);
      }
      socketToPlayer.delete(socket.id);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const mapping = socketToPlayer.get(socket.id);
    if (mapping) {
      const game = games.get(mapping.gameId);
      if (game && game.status === 'waiting') {
        game.removePlayer(mapping.playerId);
        broadcastGameState(mapping.gameId);
      }
      socketToPlayer.delete(socket.id);
    }
  });
});

// Fallback to index.html for client-side routing
app.get('*', (req, res) => {
  const distIndex = path.join(__dirname, '../dist/index.html');
  if (fs.existsSync(distIndex)) {
    res.sendFile(distIndex);
  } else {
    res.sendFile(path.join(__dirname, '../index.html'));
  }
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`UNO Server running on port ${PORT}`);
});

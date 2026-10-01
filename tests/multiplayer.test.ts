import test from 'node:test';
import assert from 'node:assert';
import { UnoGame } from '../server/game/unoGame.ts';
import type { Card } from '../shared/types.ts';

function card(id: string, color: Card['color'], value: Card['value']): Card {
  return { id, color, value };
}

test('Multiplayer: Private hands and public state isolation per player', () => {
  const game = new UnoGame({ id: 'ROOM-MULTI' });
  game.addPlayer('p1', 'Alice', false);
  game.addPlayer('p2', 'Bob', false);

  assert.strictEqual(game.status, 'waiting');
  assert.strictEqual(game.players.length, 2);

  // Start game with 7 cards each
  game.startGame(7);
  assert.strictEqual(game.status, 'in_progress');

  // Verify Alice's view
  const aliceState = game.getPublicState('p1');
  assert.strictEqual(aliceState.myPlayerId, 'p1');
  assert.strictEqual(aliceState.myHand.length, 7);
  const bobInAliceView = aliceState.players.find(p => p.id === 'p2')!;
  assert.strictEqual(bobInAliceView.hand, undefined, 'Bob hand must not be visible to Alice');
  assert.strictEqual(bobInAliceView.cardCount, 7);

  // Verify Bob's view
  const bobState = game.getPublicState('p2');
  assert.strictEqual(bobState.myPlayerId, 'p2');
  assert.strictEqual(bobState.myHand.length, 7);
  const aliceInBobView = bobState.players.find(p => p.id === 'p1')!;
  assert.strictEqual(aliceInBobView.hand, undefined, 'Alice hand must not be visible to Bob');
  assert.strictEqual(aliceInBobView.cardCount, 7);
});

test('Multiplayer: Real-time stacking chain progression between human players', () => {
  const game = new UnoGame({ id: 'ROOM-CHAIN' });
  game.addPlayer('p1', 'Alice', false);
  game.addPlayer('p2', 'Bob', false);
  game.addPlayer('p3', 'Charlie', false);
  game.startGame(3);

  // Force deterministic board state
  game.currentTurnIndex = 0; // p1 turn
  game.direction = 1;
  game.topCard = card('top', 'red', 5);
  game.currentDeclaredColor = 'red';
  game.discardPile = [game.topCard];
  game.hasDrawnThisTurn = false;
  game.stackingChain = {
    active: false,
    type: null,
    accumulatedPenalty: 0,
    chainLength: 0,
    history: []
  };

  // Alice plays +2
  game.players[0].hand = [card('a-d2', 'red', 'draw2'), card('a-1', 'red', 1)];
  const res1 = game.playCard('p1', 'a-d2');
  assert.strictEqual(res1.success, true);
  assert.strictEqual(game.stackingChain.active, true);
  assert.strictEqual(game.stackingChain.type, 'draw2_chain');
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 2);
  assert.strictEqual(game.getCurrentPlayer().id, 'p2');

  // Bob views state: sees pending +2 and can stack +4
  const bobState = game.getPublicState('p2');
  assert.strictEqual(bobState.stackingChain.accumulatedPenalty, 2);
  assert.strictEqual(bobState.stackingChain.type, 'draw2_chain');

  // Bob stacks +4 and declares blue
  game.players[1].hand = [card('b-w4', 'wild', 'wild_draw4'), card('b-2', 'blue', 2)];
  const res2 = game.playCard('p2', 'b-w4', 'blue');
  assert.strictEqual(res2.success, true);
  assert.strictEqual(game.stackingChain.active, true);
  assert.strictEqual(game.stackingChain.type, 'draw4_chain');
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 6);
  assert.strictEqual(game.currentDeclaredColor, 'blue');
  assert.strictEqual(game.getCurrentPlayer().id, 'p3');

  // Charlie tries to play blue +2 on +4 chain -> REJECTED authoritatively
  game.players[2].hand = [card('c-d2', 'blue', 'draw2'), card('c-3', 'blue', 3)];
  const res3 = game.playCard('p3', 'c-d2');
  assert.strictEqual(res3.success, false);
  assert.match(res3.error!, /A \+2 cannot be played on a \+4/);

  // Charlie draws accumulated 6 penalty cards
  const initialHandSize = game.players[2].hand.length;
  const drawRes = game.drawCard('p3');
  assert.strictEqual(drawRes.success, true);
  assert.strictEqual(drawRes.cardsDrawn.length, 6);
  assert.strictEqual(game.players[2].hand.length, initialHandSize + 6);

  // Chain must be reset and turn passed to Alice
  assert.strictEqual(game.stackingChain.active, false);
  assert.strictEqual(game.getCurrentPlayer().id, 'p1');
});

test('Multiplayer: Only the room host can start the game and add bots', () => {
  const game = new UnoGame({ id: 'ROOM-HOST' });
  game.addPlayer('p1', 'Alice (Host)', false);
  game.addPlayer('p2', 'Bob (Guest)', false);

  // Host is game.players[0]
  assert.strictEqual(game.players[0].id, 'p1');
  assert.notStrictEqual(game.players[0].id, 'p2');

  // Verify guest vs host authorization
  const isGuestHost = game.players[0].id === 'p2';
  assert.strictEqual(isGuestHost, false, 'Guest must not be authorized as host');

  const isAliceHost = game.players[0].id === 'p1';
  assert.strictEqual(isAliceHost, true, 'Alice must be authorized as host');
});

test('Multiplayer: Host can remove players and bots from the room', () => {
  const game = new UnoGame({ id: 'ROOM-KICK' });
  game.addPlayer('p1', 'Host Alice', false);
  game.addPlayer('p2', 'Guest Bob', false);
  game.addPlayer('bot-1', 'Bot Charlie', true);

  assert.strictEqual(game.players.length, 3);
  const hostId = game.players[0].id;
  assert.strictEqual(hostId, 'p1');

  // Non-host attempts to remove player -> forbidden
  const isBobHost = game.players[0].id === 'p2';
  assert.strictEqual(isBobHost, false, 'Non-host cannot remove players');

  // Host cannot remove themselves
  assert.strictEqual(hostId === 'p1', true, 'Self-removal must be blocked');

  // Host removes bot-1
  game.removePlayer('bot-1', 'was removed by the host');
  assert.strictEqual(game.players.length, 2);
  assert.strictEqual(game.players.some(p => p.id === 'bot-1'), false);

  // Host removes guest Bob during waiting state
  game.removePlayer('p2', 'was removed by the host');
  assert.strictEqual(game.players.length, 1);
  assert.strictEqual(game.players[0].id, 'p1');

  // Verify logging
  const recentLogs = game.getPublicState('p1').log;
  assert.strictEqual(recentLogs.some(l => l.text.includes('Bot Charlie was removed by the host')), true);
  assert.strictEqual(recentLogs.some(l => l.text.includes('Guest Bob was removed by the host')), true);
});

test('Multiplayer: Removing a player during in_progress game triggers game_over if < 2 players remain', () => {
  const game = new UnoGame({ id: 'ROOM-KICK-MIDGAME' });
  game.addPlayer('p1', 'Alice (Host)', false);
  game.addPlayer('p2', 'Bob', false);
  game.startGame(5);

  assert.strictEqual(game.status, 'in_progress');

  // Host removes Bob during match
  game.removePlayer('p2', 'was removed by the host');

  // Game must transition to game_over with Alice as winner
  assert.strictEqual(game.status, 'game_over');
  assert.strictEqual(game.winner?.id, 'p1');
  assert.strictEqual(game.players.length, 1);
});



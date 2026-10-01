import test from 'node:test';
import assert from 'node:assert';
import { UnoGame } from '../server/game/unoGame.ts';
import type { Card, StandardColor } from '../shared/types.ts';

function createCard(id: string, color: Card['color'], value: Card['value']): Card {
  return { id, color, value };
}

function filler(id: string): Card {
  return { id, color: 'blue', value: 0 };
}

function setupTestState(game: UnoGame, topCard: Card, declaredColor: StandardColor) {
  game.direction = 1;
  game.topCard = topCard;
  game.discardPile = [topCard];
  game.currentDeclaredColor = declaredColor;
  game.currentTurnIndex = 0;
  game.hasDrawnThisTurn = false;
  game.status = 'in_progress';
  game.stackingChain = {
    active: false,
    type: null,
    accumulatedPenalty: 0,
    chainLength: 0,
    history: []
  };
}

test('Authoritative: Rejects plays when not player turn', () => {
  const game = new UnoGame({
    initialPlayers: [
      { id: 'p1', name: 'Alice', isBot: false },
      { id: 'p2', name: 'Bob', isBot: false }
    ]
  });
  game.startGame(3);
  setupTestState(game, createCard('top', 'red', 5), 'red');

  // p2 tries to play on p1's turn
  game.players[1].hand = [createCard('c2', 'red', 7), filler('f2')];
  const res = game.playCard('p2', 'c2');
  assert.strictEqual(res.success, false);
  assert.match(res.error!, /It is not your turn/);
});

test('Authoritative: Rejects cards not present in player hand', () => {
  const game = new UnoGame({
    initialPlayers: [
      { id: 'p1', name: 'Alice', isBot: false },
      { id: 'p2', name: 'Bob', isBot: false }
    ]
  });
  game.startGame(3);
  setupTestState(game, createCard('top', 'red', 5), 'red');

  game.players[0].hand = [createCard('c1', 'red', 5), filler('f1')];
  const res = game.playCard('p1', 'non_existent_card_id');
  assert.strictEqual(res.success, false);
  assert.match(res.error!, /Card not found in your hand/);
});

test('Authoritative: Wild / +4 requires valid color declaration', () => {
  const game = new UnoGame({
    initialPlayers: [
      { id: 'p1', name: 'Alice', isBot: false },
      { id: 'p2', name: 'Bob', isBot: false }
    ]
  });
  game.startGame(3);
  setupTestState(game, createCard('top', 'red', 5), 'red');

  game.players[0].hand = [createCard('w1', 'wild', 'wild_draw4'), filler('f1')];
  // Attempt with missing declaredColor
  const res1 = game.playCard('p1', 'w1');
  assert.strictEqual(res1.success, false);
  assert.match(res1.error!, /You must declare a color/);

  // Attempt with invalid declaredColor
  const res2 = game.playCard('p1', 'w1', 'purple' as unknown as StandardColor);
  assert.strictEqual(res2.success, false);
  assert.match(res2.error!, /You must declare a color/);

  // Card still in hand
  assert.strictEqual(game.players[0].hand.length, 2);
  assert.strictEqual(game.stackingChain.active, false);
});

test('Authoritative: State immutability on invalid stacking move', () => {
  const game = new UnoGame({
    initialPlayers: [
      { id: 'p1', name: 'Alice', isBot: false },
      { id: 'p2', name: 'Bob', isBot: false }
    ]
  });
  game.startGame(3);
  setupTestState(game, createCard('top', 'red', 3), 'red');

  const p1_draw4 = createCard('c1', 'wild', 'wild_draw4');
  const p2_draw2 = createCard('c2', 'green', 'draw2');

  game.players[0].hand = [p1_draw4, filler('f1')];
  game.players[1].hand = [p2_draw2, filler('f2')];

  // Alice plays +4
  game.playCard('p1', 'c1', 'yellow');
  assert.strictEqual(game.stackingChain.active, true);
  assert.strictEqual(game.stackingChain.type, 'draw4_chain');
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 4);
  assert.strictEqual(game.currentTurnIndex, 1); // Bob's turn

  // Snapshot before invalid move
  const handBefore = [...game.players[1].hand];
  const discardBefore = [...game.discardPile];
  const chainBefore = { ...game.stackingChain };

  // Bob attempts +2 on +4 chain
  const reject = game.playCard('p2', 'c2');
  assert.strictEqual(reject.success, false);
  assert.match(reject.error!, /A \+2 cannot be played on a \+4/);

  // Assert complete state preservation
  assert.strictEqual(game.players[1].hand.length, handBefore.length);
  assert.strictEqual(game.discardPile.length, discardBefore.length);
  assert.strictEqual(game.topCard.id, 'c1');
  assert.strictEqual(game.stackingChain.accumulatedPenalty, chainBefore.accumulatedPenalty);
  assert.strictEqual(game.stackingChain.type, chainBefore.type);
  assert.strictEqual(game.currentTurnIndex, 1); // Still Bob's turn
});

test('Authoritative: Player cannot pass turn while stacking chain is active', () => {
  const game = new UnoGame({
    initialPlayers: [
      { id: 'p1', name: 'Alice', isBot: false },
      { id: 'p2', name: 'Bob', isBot: false }
    ]
  });
  game.startGame(3);
  setupTestState(game, createCard('top', 'red', 3), 'red');

  game.players[0].hand = [createCard('c1', 'red', 'draw2'), filler('f1')];
  game.players[1].hand = [filler('f2_1'), filler('f2_2')];

  game.playCard('p1', 'c1');
  assert.strictEqual(game.stackingChain.active, true);

  // Bob tries to pass turn instead of drawing the penalty
  const passRes = game.passTurn('p2');
  assert.strictEqual(passRes.success, false);
  assert.match(passRes.error!, /Cannot pass during an active stacking chain/);
});

test('Normal Play: drawCard and bot turn draw succeed when no stacking chain', () => {
  const game = new UnoGame({
    initialPlayers: [
      { id: 'p1', name: 'Alice', isBot: false },
      { id: 'bot1', name: 'Bot-Bob', isBot: true }
    ]
  });
  game.startGame(3);
  setupTestState(game, createCard('top', 'red', 5), 'red');

  // Human draws 1 card
  const initialHand = game.players[0].hand.length;
  const drawRes = game.drawCard('p1');
  assert.strictEqual(drawRes.success, true);
  assert.strictEqual(drawRes.penaltyResolved, false);
  assert.strictEqual(drawRes.cardsDrawn.length, 1);
  assert.strictEqual(game.players[0].hand.length, initialHand + 1);

  // Advance turn to bot
  game.advanceTurn(1);
  assert.strictEqual(game.getCurrentPlayer().id, 'bot1');

  // Bot has no playable cards, draws normally
  game.players[1].hand = [createCard('b1', 'blue', 1), createCard('b2', 'blue', 2)];
  game.drawPile = [createCard('deck1', 'green', 9)]; // drawn card also not playable

  const botRes = game.playBotTurn();
  assert.strictEqual(botRes.acted, true);
  assert.strictEqual(botRes.action, 'pass');
});


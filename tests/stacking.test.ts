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

test('House Rule: +2 chain -> +2 -> +2 -> +2 = next player draws 6 if unable to continue', () => {
  const game = new UnoGame({
    initialPlayers: [
      { id: 'p1', name: 'Alice', isBot: false },
      { id: 'p2', name: 'Bob', isBot: false },
      { id: 'p3', name: 'Charlie', isBot: false },
      { id: 'p4', name: 'Dave', isBot: false }
    ]
  });

  game.startGame(3);
  setupTestState(game, createCard('top', 'red', 5), 'red');

  const p1_draw2 = createCard('c1', 'red', 'draw2');
  const p2_draw2 = createCard('c2', 'blue', 'draw2');
  const p3_draw2 = createCard('c3', 'green', 'draw2');
  const p4_norm = createCard('c4', 'yellow', 7);

  game.players[0].hand = [p1_draw2, filler('f1_1'), filler('f1_2')];
  game.players[1].hand = [p2_draw2, filler('f2_1'), filler('f2_2')];
  game.players[2].hand = [p3_draw2, filler('f3_1'), filler('f3_2')];
  game.players[3].hand = [p4_norm, filler('f4_1'), filler('f4_2')];

  // 1. Alice plays +2
  const r1 = game.playCard('p1', 'c1');
  assert.strictEqual(r1.success, true);
  assert.strictEqual(game.stackingChain.active, true);
  assert.strictEqual(game.stackingChain.type, 'draw2_chain');
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 2);
  assert.strictEqual(game.getCurrentPlayer().id, 'p2'); // Bob's turn

  // 2. Bob plays +2 (stacking onto +2)
  const r2 = game.playCard('p2', 'c2');
  assert.strictEqual(r2.success, true);
  assert.strictEqual(game.stackingChain.active, true);
  assert.strictEqual(game.stackingChain.type, 'draw2_chain'); // Remains +2-compatible chain
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 4);
  assert.strictEqual(game.getCurrentPlayer().id, 'p3'); // Charlie's turn

  // 3. Charlie plays +2 (stacking onto +2)
  const r3 = game.playCard('p3', 'c3');
  assert.strictEqual(r3.success, true);
  assert.strictEqual(game.stackingChain.active, true);
  assert.strictEqual(game.stackingChain.type, 'draw2_chain');
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 6);
  assert.strictEqual(game.getCurrentPlayer().id, 'p4'); // Dave's turn

  // 4. Dave cannot continue (+2 chain, but only has normal card yellow 7)
  const invalidDavePlay = game.playCard('p4', 'c4');
  assert.strictEqual(invalidDavePlay.success, false);
  assert.match(invalidDavePlay.error!, /INVALID MOVE/);

  // Dave draws penalty
  const initialHandSize = game.players[3].hand.length;
  const drawRes = game.drawCard('p4');
  assert.strictEqual(drawRes.success, true);
  assert.strictEqual(drawRes.penaltyResolved, true);
  assert.strictEqual(drawRes.penaltyAmount, 6);
  assert.strictEqual(drawRes.cardsDrawn.length, 6);
  assert.strictEqual(game.players[3].hand.length, initialHandSize + 6);

  // Chain must reset and Dave's turn must end
  assert.strictEqual(game.stackingChain.active, false);
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 0);
  assert.strictEqual(game.stackingChain.type, null);
  assert.strictEqual(game.getCurrentPlayer().id, 'p1'); // Alice's turn next
});

test('House Rule: +2 -> +4 = next player receives total penalty of 6 and may play +4 only', () => {
  const game = new UnoGame({
    initialPlayers: [
      { id: 'p1', name: 'Alice', isBot: false },
      { id: 'p2', name: 'Bob', isBot: false },
      { id: 'p3', name: 'Charlie', isBot: false }
    ]
  });

  game.startGame(3);
  setupTestState(game, createCard('top', 'blue', 3), 'blue');

  const p1_draw2 = createCard('c1', 'blue', 'draw2');
  const p2_draw4 = createCard('c2', 'wild', 'wild_draw4');
  const p3_draw2 = createCard('c3', 'green', 'draw2');
  const p3_draw4 = createCard('c4', 'wild', 'wild_draw4');

  game.players[0].hand = [p1_draw2, filler('f1')];
  game.players[1].hand = [p2_draw4, filler('f2')];
  game.players[2].hand = [p3_draw2, p3_draw4, filler('f3')];

  // Alice plays +2
  const r1 = game.playCard('p1', 'c1');
  assert.strictEqual(r1.success, true);
  assert.strictEqual(game.stackingChain.type, 'draw2_chain');
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 2);

  // Bob plays +4 on the +2 chain!
  const r2 = game.playCard('p2', 'c2', 'green');
  assert.strictEqual(r2.success, true);
  // Accumulated penalty is 2 + 4 = 6!
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 6);
  // Chain MUST become +4-only chain ('draw4_chain')!
  assert.strictEqual(game.stackingChain.type, 'draw4_chain');
  assert.strictEqual(game.currentDeclaredColor, 'green');

  // Charlie now faces penalty of 6 and attempts to play +2:
  const invalidPlay = game.playCard('p3', 'c3');
  assert.strictEqual(invalidPlay.success, false);
  assert.match(invalidPlay.error!, /A \+2 cannot be played on a \+4/);
  // Verify state did not change
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 6);
  assert.strictEqual(game.stackingChain.type, 'draw4_chain');

  // Charlie can play +4 only:
  const validPlay = game.playCard('p3', 'c4', 'yellow');
  assert.strictEqual(validPlay.success, true);
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 10);
  assert.strictEqual(game.stackingChain.type, 'draw4_chain');
});

test('House Rule: +2 -> +2 -> +4 = next player receives total penalty of 8 and may play +4 only', () => {
  const game = new UnoGame({
    initialPlayers: [
      { id: 'p1', name: 'Alice', isBot: false },
      { id: 'p2', name: 'Bob', isBot: false },
      { id: 'p3', name: 'Charlie', isBot: false },
      { id: 'p4', name: 'Dave', isBot: false }
    ]
  });

  game.startGame(3);
  setupTestState(game, createCard('top', 'yellow', 1), 'yellow');

  const p1_draw2 = createCard('c1', 'yellow', 'draw2');
  const p2_draw2 = createCard('c2', 'red', 'draw2');
  const p3_draw4 = createCard('c3', 'wild', 'wild_draw4');
  const p4_draw2 = createCard('c4', 'blue', 'draw2');

  game.players[0].hand = [p1_draw2, filler('f1')];
  game.players[1].hand = [p2_draw2, filler('f2')];
  game.players[2].hand = [p3_draw4, filler('f3')];
  game.players[3].hand = [p4_draw2, filler('f4')];

  // Alice plays +2 (+2 penalty)
  const r1 = game.playCard('p1', 'c1');
  assert.strictEqual(r1.success, true);
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 2);
  assert.strictEqual(game.stackingChain.type, 'draw2_chain');

  // Bob plays +2 (+4 penalty)
  const r2 = game.playCard('p2', 'c2');
  assert.strictEqual(r2.success, true);
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 4);
  assert.strictEqual(game.stackingChain.type, 'draw2_chain');

  // Charlie plays +4 (+8 penalty, chain switches to +4-only)
  const r3 = game.playCard('p3', 'c3', 'blue');
  assert.strictEqual(r3.success, true);
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 8);
  assert.strictEqual(game.stackingChain.type, 'draw4_chain');

  // Dave attempts +2 -> INVALID MOVE
  const daveInvalid = game.playCard('p4', 'c4');
  assert.strictEqual(daveInvalid.success, false);
  assert.match(daveInvalid.error!, /A \+2 cannot be played on a \+4/);

  // Dave draws 8 cards
  const drawRes = game.drawCard('p4');
  assert.strictEqual(drawRes.success, true);
  assert.strictEqual(drawRes.penaltyAmount, 8);
  assert.strictEqual(drawRes.cardsDrawn.length, 8);
  assert.strictEqual(game.stackingChain.active, false);
});

test('House Rule: +4 chain -> +4 -> +4 -> +4 = next player draws 12 if unable to continue', () => {
  const game = new UnoGame({
    initialPlayers: [
      { id: 'p1', name: 'Alice', isBot: false },
      { id: 'p2', name: 'Bob', isBot: false },
      { id: 'p3', name: 'Charlie', isBot: false },
      { id: 'p4', name: 'Dave', isBot: false }
    ]
  });

  game.startGame(3);
  setupTestState(game, createCard('top', 'green', 9), 'green');

  const p1_draw4 = createCard('c1', 'wild', 'wild_draw4');
  const p2_draw4 = createCard('c2', 'wild', 'wild_draw4');
  const p3_draw4 = createCard('c3', 'wild', 'wild_draw4');

  game.players[0].hand = [p1_draw4, filler('f1')];
  game.players[1].hand = [p2_draw4, filler('f2')];
  game.players[2].hand = [p3_draw4, filler('f3')];
  game.players[3].hand = [createCard('c4', 'green', 5), filler('f4')];

  // 1. Alice plays +4
  const r1 = game.playCard('p1', 'c1', 'blue');
  assert.strictEqual(r1.success, true);
  assert.strictEqual(game.stackingChain.active, true);
  assert.strictEqual(game.stackingChain.type, 'draw4_chain');
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 4);

  // 2. Bob plays +4
  const r2 = game.playCard('p2', 'c2', 'red');
  assert.strictEqual(r2.success, true);
  assert.strictEqual(game.stackingChain.type, 'draw4_chain');
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 8);

  // 3. Charlie plays +4
  const r3 = game.playCard('p3', 'c3', 'yellow');
  assert.strictEqual(r3.success, true);
  assert.strictEqual(game.stackingChain.type, 'draw4_chain');
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 12);

  // 4. Dave cannot continue, draws 12 cards
  const drawRes = game.drawCard('p4');
  assert.strictEqual(drawRes.success, true);
  assert.strictEqual(drawRes.penaltyAmount, 12);
  assert.strictEqual(drawRes.cardsDrawn.length, 12);
  assert.strictEqual(game.stackingChain.active, false);
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 0);
});

test('House Rule: +2 -> +4 -> +4 = next player draws 10 if unable to continue', () => {
  const game = new UnoGame({
    initialPlayers: [
      { id: 'p1', name: 'Alice', isBot: false },
      { id: 'p2', name: 'Bob', isBot: false },
      { id: 'p3', name: 'Charlie', isBot: false },
      { id: 'p4', name: 'Dave', isBot: false }
    ]
  });

  game.startGame(3);
  setupTestState(game, createCard('top', 'red', 4), 'red');

  const p1_draw2 = createCard('c1', 'red', 'draw2');
  const p2_draw4 = createCard('c2', 'wild', 'wild_draw4');
  const p3_draw4 = createCard('c3', 'wild', 'wild_draw4');

  game.players[0].hand = [p1_draw2, filler('f1')];
  game.players[1].hand = [p2_draw4, filler('f2')];
  game.players[2].hand = [p3_draw4, filler('f3')];
  game.players[3].hand = [createCard('c4', 'red', 1), filler('f4')];

  // +2 (accumulated: 2, type: draw2_chain)
  const r1 = game.playCard('p1', 'c1');
  assert.strictEqual(r1.success, true);
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 2);
  assert.strictEqual(game.stackingChain.type, 'draw2_chain');

  // +4 (accumulated: 6, type: draw4_chain)
  const r2 = game.playCard('p2', 'c2', 'yellow');
  assert.strictEqual(r2.success, true);
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 6);
  assert.strictEqual(game.stackingChain.type, 'draw4_chain');

  // +4 (accumulated: 10, type: draw4_chain)
  const r3 = game.playCard('p3', 'c3', 'blue');
  assert.strictEqual(r3.success, true);
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 10);
  assert.strictEqual(game.stackingChain.type, 'draw4_chain');

  // Dave draws 10
  const drawRes = game.drawCard('p4');
  assert.strictEqual(drawRes.penaltyAmount, 10);
  assert.strictEqual(drawRes.cardsDrawn.length, 10);
});

test('House Rule: +4 -> +2 = INVALID MOVE', () => {
  const game = new UnoGame({
    initialPlayers: [
      { id: 'p1', name: 'Alice', isBot: false },
      { id: 'p2', name: 'Bob', isBot: false }
    ]
  });

  game.startGame(3);
  setupTestState(game, createCard('top', 'blue', 2), 'blue');

  const p1_draw4 = createCard('c1', 'wild', 'wild_draw4');
  const p2_draw2 = createCard('c2', 'blue', 'draw2');

  game.players[0].hand = [p1_draw4, filler('f1')];
  game.players[1].hand = [p2_draw2, filler('f2')];

  // Alice plays +4
  const r1 = game.playCard('p1', 'c1', 'blue');
  assert.strictEqual(r1.success, true);
  assert.strictEqual(game.stackingChain.active, true);
  assert.strictEqual(game.stackingChain.type, 'draw4_chain');

  // Bob tries to play +2 on +4:
  const invalidMove = game.playCard('p2', 'c2');
  assert.strictEqual(invalidMove.success, false);
  assert.match(invalidMove.error!, /A \+2 cannot be played on a \+4/);
  // Verify Bob still holds the card
  assert.strictEqual(game.players[1].hand.length, 2);
  assert.strictEqual(game.players[1].hand[0].id, 'c2');
  // Verify top card is still Alice's +4
  assert.strictEqual(game.topCard.value, 'wild_draw4');
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 4);
});

test('House Rule: Non-stacking cards (Normal, Skip, Reverse, Wild) cannot be played during +4 chain', () => {
  const game = new UnoGame({
    initialPlayers: [
      { id: 'p1', name: 'Alice', isBot: false },
      { id: 'p2', name: 'Bob', isBot: false }
    ]
  });

  game.startGame(3);
  setupTestState(game, createCard('top', 'red', 1), 'red');

  game.players[0].hand = [createCard('c1', 'wild', 'wild_draw4'), filler('f1')];
  game.players[1].hand = [
    createCard('c_num', 'red', 5),
    createCard('c_skip', 'red', 'skip'),
    createCard('c_rev', 'red', 'reverse'),
    createCard('c_wild', 'wild', 'wild')
  ];

  game.playCard('p1', 'c1', 'red');
  assert.strictEqual(game.stackingChain.type, 'draw4_chain');

  // Attempt normal card
  const rNum = game.playCard('p2', 'c_num');
  assert.strictEqual(rNum.success, false);
  assert.match(rNum.error!, /Active \+4 chain in progress/);

  // Attempt Skip
  const rSkip = game.playCard('p2', 'c_skip');
  assert.strictEqual(rSkip.success, false);
  assert.match(rSkip.error!, /Active \+4 chain in progress/);

  // Attempt Reverse
  const rRev = game.playCard('p2', 'c_rev');
  assert.strictEqual(rRev.success, false);
  assert.match(rRev.error!, /Active \+4 chain in progress/);

  // Attempt Wild
  const rWild = game.playCard('p2', 'c_wild', 'red');
  assert.strictEqual(rWild.success, false);
  assert.match(rWild.error!, /Active \+4 chain in progress/);
});

test('House Rule: Non-stacking cards (Normal, Skip, Reverse, Wild) cannot be played during +2 chain', () => {
  const game = new UnoGame({
    initialPlayers: [
      { id: 'p1', name: 'Alice', isBot: false },
      { id: 'p2', name: 'Bob', isBot: false }
    ]
  });

  game.startGame(3);
  setupTestState(game, createCard('top', 'green', 1), 'green');

  game.players[0].hand = [createCard('c1', 'green', 'draw2'), filler('f1')];
  game.players[1].hand = [
    createCard('c_num', 'green', 5),
    createCard('c_skip', 'green', 'skip'),
    createCard('c_rev', 'green', 'reverse'),
    createCard('c_wild', 'wild', 'wild')
  ];

  game.playCard('p1', 'c1');
  assert.strictEqual(game.stackingChain.type, 'draw2_chain');

  // Attempt normal card
  const rNum = game.playCard('p2', 'c_num');
  assert.strictEqual(rNum.success, false);
  assert.match(rNum.error!, /Active \+2 chain in progress/);

  // Attempt Skip
  const rSkip = game.playCard('p2', 'c_skip');
  assert.strictEqual(rSkip.success, false);

  // Attempt Reverse
  const rRev = game.playCard('p2', 'c_rev');
  assert.strictEqual(rRev.success, false);

  // Attempt Wild
  const rWild = game.playCard('p2', 'c_wild', 'green');
  assert.strictEqual(rWild.success, false);
});

test('Bot AI: Stacks valid card or draws accumulated penalty', () => {
  const game = new UnoGame({
    initialPlayers: [
      { id: 'p1', name: 'Alice', isBot: false },
      { id: 'bot1', name: 'Bot-Bob', isBot: true }
    ]
  });

  game.startGame(3);
  setupTestState(game, createCard('top', 'blue', 1), 'blue');

  // Alice plays +2
  game.players[0].hand = [createCard('c1', 'blue', 'draw2'), filler('f1')];
  game.players[1].hand = [createCard('bot_c1', 'red', 'draw2'), filler('bf1')];

  game.playCard('p1', 'c1');
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 2);
  assert.strictEqual(game.getCurrentPlayer().id, 'bot1');

  // Bot's turn: Bot has a +2, so bot should stack it!
  const botTurn1 = game.playBotTurn();
  assert.strictEqual(botTurn1.acted, true);
  assert.strictEqual(botTurn1.action, 'play');
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 4);
  assert.strictEqual(game.stackingChain.type, 'draw2_chain');

  // Now Alice plays +4 (accumulated: 8, becomes +4-only)
  game.players[0].hand.push(createCard('c2', 'wild', 'wild_draw4'));
  game.playCard('p1', 'c2', 'green');
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 8);
  assert.strictEqual(game.stackingChain.type, 'draw4_chain');

  // Bot has NO +4, only filler cards
  assert.strictEqual(game.getCurrentPlayer().id, 'bot1');
  const botInitialHandSize = game.players[1].hand.length;
  const botTurn2 = game.playBotTurn();
  assert.strictEqual(botTurn2.acted, true);
  assert.strictEqual(botTurn2.action, 'draw');
  assert.strictEqual(botTurn2.penaltyResolved, true);
  // Bot drew 8 cards
  assert.strictEqual(game.players[1].hand.length, botInitialHandSize + 8);
  // Chain reset
  assert.strictEqual(game.stackingChain.active, false);
});

test('Server State: getPublicState() includes distinct chain type and accumulated penalty', () => {
  const game = new UnoGame({
    initialPlayers: [
      { id: 'p1', name: 'Alice', isBot: false },
      { id: 'p2', name: 'Bob', isBot: false }
    ]
  });

  game.startGame(3);
  setupTestState(game, createCard('top', 'yellow', 5), 'yellow');
  game.players[0].hand = [createCard('c1', 'yellow', 'draw2'), filler('f1')];

  // Play +2
  game.playCard('p1', 'c1');

  const pubState = game.getPublicState('p2');
  assert.strictEqual(pubState.stackingChain.active, true);
  assert.strictEqual(pubState.stackingChain.type, 'draw2_chain');
  assert.strictEqual(pubState.stackingChain.accumulatedPenalty, 2);
  assert.strictEqual(pubState.stackingChain.history.length, 1);
  assert.strictEqual(pubState.currentTurnPlayerId, 'p2');
});

test('Preset Scenarios: Properly initialize house rule states', () => {
  const game = new UnoGame({
    initialPlayers: [
      { id: 'p1', name: 'Alice', isBot: false },
      { id: 'p2', name: 'Bob', isBot: true }
    ]
  });
  game.startGame(3);

  // Scenario 1: +2 -> +2 -> +2
  assert.strictEqual(game.loadScenario('chain_2_2_2', 'p1'), true);
  assert.strictEqual(game.stackingChain.active, true);
  assert.strictEqual(game.stackingChain.type, 'draw2_chain');
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 6);

  // Scenario 2: +2 -> +4
  assert.strictEqual(game.loadScenario('chain_2_4', 'p1'), true);
  assert.strictEqual(game.stackingChain.active, true);
  assert.strictEqual(game.stackingChain.type, 'draw4_chain');
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 6);

  // Scenario 3: +2 -> +2 -> +4
  assert.strictEqual(game.loadScenario('chain_2_2_4', 'p1'), true);
  assert.strictEqual(game.stackingChain.active, true);
  assert.strictEqual(game.stackingChain.type, 'draw4_chain');
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 8);

  // Scenario 4: +4 -> +4 -> +4
  assert.strictEqual(game.loadScenario('chain_4_4_4', 'p1'), true);
  assert.strictEqual(game.stackingChain.active, true);
  assert.strictEqual(game.stackingChain.type, 'draw4_chain');
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 12);

  // Scenario 5: +4 -> +2 rejection test
  assert.strictEqual(game.loadScenario('chain_4_reject_2', 'p1'), true);
  assert.strictEqual(game.stackingChain.active, true);
  assert.strictEqual(game.stackingChain.type, 'draw4_chain');
  assert.strictEqual(game.stackingChain.accumulatedPenalty, 4);
  const draw2Card = game.players[0].hand.find(c => c.value === 'draw2')!;
  const rejectRes = game.playCard('p1', draw2Card.id);
  assert.strictEqual(rejectRes.success, false);
  assert.match(rejectRes.error!, /A \+2 cannot be played on a \+4/);
});


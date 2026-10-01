import type {
  Card,
  CardColor,
  CardValue,
  GameLogEntry,
  GameState,
  Player,
  PublicGameState,
  PublicPlayer,
  StackingChainState,
  StandardColor
} from '../../shared/types.ts';
import { validateCardPlay } from '../../shared/rules.ts';
import { createDeck, shuffleDeck } from './deck.ts';

export interface GameOptions {
  id?: string;
  initialPlayers?: Array<{ id: string; name: string; isBot: boolean }>;
  customDeck?: Card[]; // Useful for deterministic unit testing
  cardsPerPlayer?: number;
}

export class UnoGame {
  public id: string;
  public players: Player[] = [];
  public currentTurnIndex: number = 0;
  public direction: 1 | -1 = 1;
  public drawPile: Card[] = [];
  public discardPile: Card[] = [];
  public topCard!: Card;
  public currentDeclaredColor!: StandardColor;
  public stackingChain: StackingChainState;
  public status: 'waiting' | 'in_progress' | 'game_over' = 'waiting';
  public winner: Player | null = null;
  public log: GameLogEntry[] = [];
  public hasDrawnThisTurn: boolean = false;

  constructor(options: GameOptions = {}) {
    this.id = options.id || `game-${Date.now()}`;
    this.stackingChain = {
      active: false,
      type: null,
      accumulatedPenalty: 0,
      chainLength: 0,
      history: []
    };

    if (options.initialPlayers && options.initialPlayers.length > 0) {
      for (const p of options.initialPlayers) {
        this.addPlayer(p.id, p.name, p.isBot);
      }
    }

    if (options.customDeck) {
      this.drawPile = [...options.customDeck];
    }
  }

  public addPlayer(id: string, name: string, isBot: boolean = false): boolean {
    if (this.status !== 'waiting') return false;
    if (this.players.some(p => p.id === id)) return false;

    this.players.push({
      id,
      name,
      isBot,
      hand: [],
      cardCount: 0
    });

    this.addLog(`Player ${name} joined the game.`, 'info');
    return true;
  }

  public removePlayer(id: string): void {
    const idx = this.players.findIndex(p => p.id === id);
    if (idx !== -1) {
      const removed = this.players[idx];
      this.players.splice(idx, 1);
      this.addLog(`Player ${removed.name} left the game.`, 'info');
      if (this.status === 'in_progress') {
        if (this.players.length < 2) {
          this.status = 'game_over';
          this.winner = this.players[0] || null;
          this.addLog(`Game ended because not enough players remain.`, 'info');
        } else if (this.currentTurnIndex >= this.players.length) {
          this.currentTurnIndex = 0;
        }
      }
    }
  }

  public startGame(cardsPerPlayer: number = 7): boolean {
    if (this.players.length < 2) {
      return false;
    }

    if (this.drawPile.length === 0) {
      this.drawPile = shuffleDeck(createDeck());
    }

    // Deal cards
    for (const player of this.players) {
      player.hand = this.drawCardsFromDeck(cardsPerPlayer);
      player.cardCount = player.hand.length;
    }

    // Reveal top card (ensure it's not a wild_draw4 for starting card)
    let initialTopCard: Card | undefined;
    while (!initialTopCard || initialTopCard.value === 'wild_draw4') {
      const drawn = this.drawCardsFromDeck(1)[0];
      if (drawn.value === 'wild_draw4') {
        // Return back to bottom of deck
        this.drawPile.unshift(drawn);
      } else {
        initialTopCard = drawn;
      }
    }

    this.topCard = initialTopCard;
    this.discardPile = [initialTopCard];

    // Determine starting color
    if (initialTopCard.color === 'wild') {
      this.currentDeclaredColor = 'red'; // Default for opening Wild
    } else {
      this.currentDeclaredColor = initialTopCard.color as StandardColor;
    }

    this.status = 'in_progress';
    this.currentTurnIndex = 0;
    this.hasDrawnThisTurn = false;

    // Reset chain state
    this.stackingChain = {
      active: false,
      type: null,
      accumulatedPenalty: 0,
      chainLength: 0,
      history: []
    };

    this.addLog(`Game started! Initial card is ${this.topCard.color} ${this.topCard.value}.`, 'info');

    // Handle initial action card if top card was an action card
    if (initialTopCard.value === 'draw2') {
      this.stackingChain = {
        active: true,
        type: 'draw2_chain',
        accumulatedPenalty: 2,
        chainLength: 1,
        history: [{
          cardId: initialTopCard.id,
          cardType: 'draw2',
          cardColor: initialTopCard.color,
          penaltyAdded: 2,
          totalAccumulated: 2,
          playedBy: 'dealer',
          playerName: 'Dealer'
        }]
      };
      this.addLog(`First card is a Draw Two! Active +2 chain started (+2 penalty pending).`, 'stack');
    } else if (initialTopCard.value === 'skip') {
      this.advanceTurn(1);
      this.addLog(`First card is Skip! Player ${this.players[0].name} was skipped.`, 'info');
    } else if (initialTopCard.value === 'reverse') {
      this.direction = -1;
      this.currentTurnIndex = this.players.length - 1;
      this.addLog(`First card is Reverse! Direction reversed.`, 'info');
    }

    return true;
  }

  public getCurrentPlayer(): Player {
    return this.players[this.currentTurnIndex];
  }

  /**
   * Play a card with authoritative server-side validation.
   */
  public playCard(
    playerId: string,
    cardId: string,
    declaredColor?: StandardColor
  ): { success: boolean; error?: string; isStackMove?: boolean; penaltyResolved?: boolean } {
    if (this.status !== 'in_progress') {
      return { success: false, error: 'Game is not in progress.' };
    }

    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer.id !== playerId) {
      return { success: false, error: `It is not your turn! Current turn: ${currentPlayer.name}` };
    }

    const cardIndex = currentPlayer.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
      return { success: false, error: 'Card not found in your hand.' };
    }

    const card = currentPlayer.hand[cardIndex];

    // Server authoritative rule validation
    const validation = validateCardPlay(card, this.topCard, this.currentDeclaredColor, this.stackingChain);
    if (!validation.valid) {
      this.addLog(`${currentPlayer.name} attempted invalid move with ${card.color} ${card.value}: ${validation.reason}`, 'error');
      return { success: false, error: validation.reason };
    }

    // Color declaration required for Wild cards
    let finalColor: StandardColor;
    if (card.color === 'wild') {
      if (!declaredColor || !['red', 'blue', 'green', 'yellow'].includes(declaredColor)) {
        return { success: false, error: 'You must declare a color (red, blue, green, or yellow) when playing a Wild card.' };
      }
      finalColor = declaredColor;
    } else {
      finalColor = card.color as StandardColor;
    }

    // Play card: remove from hand, push to discard pile
    currentPlayer.hand.splice(cardIndex, 1);
    currentPlayer.cardCount = currentPlayer.hand.length;
    this.discardPile.push(card);
    this.topCard = card;
    this.currentDeclaredColor = finalColor;
    this.hasDrawnThisTurn = false;

    // Check if player won
    if (currentPlayer.hand.length === 0) {
      this.status = 'game_over';
      this.winner = currentPlayer;
      this.addLog(`🎉 ${currentPlayer.name} played ${card.color} ${card.value} and WON the game!`, 'win');
      return { success: true };
    }

    // Stacking chain transitions
    if (card.value === 'draw2') {
      if (!this.stackingChain.active) {
        // Start a +2 chain
        this.stackingChain = {
          active: true,
          type: 'draw2_chain',
          accumulatedPenalty: 2,
          chainLength: 1,
          history: [{
            cardId: card.id,
            cardType: 'draw2',
            cardColor: card.color,
            penaltyAdded: 2,
            totalAccumulated: 2,
            playedBy: currentPlayer.id,
            playerName: currentPlayer.name
          }]
        };
        this.addLog(`${currentPlayer.name} played Draw Two (+2)! Started +2 chain with +2 penalty.`, 'stack');
      } else {
        // Stacking onto existing +2 chain: remains a +2-compatible chain!
        const newAccumulated = this.stackingChain.accumulatedPenalty + 2;
        this.stackingChain.accumulatedPenalty = newAccumulated;
        this.stackingChain.chainLength += 1;
        this.stackingChain.type = 'draw2_chain'; // stays +2-compatible chain
        this.stackingChain.history.push({
          cardId: card.id,
          cardType: 'draw2',
          cardColor: card.color,
          penaltyAdded: 2,
          totalAccumulated: newAccumulated,
          playedBy: currentPlayer.id,
          playerName: currentPlayer.name
        });
        this.addLog(`${currentPlayer.name} stacked Draw Two (+2)! Chain accumulated to +${newAccumulated} PENALTY.`, 'stack');
      }

      this.advanceTurn(1);
      return { success: true, isStackMove: true };
    }

    if (card.value === 'wild_draw4') {
      if (!this.stackingChain.active) {
        // Started a new +4 chain
        this.stackingChain = {
          active: true,
          type: 'draw4_chain',
          accumulatedPenalty: 4,
          chainLength: 1,
          history: [{
            cardId: card.id,
            cardType: 'wild_draw4',
            cardColor: 'wild',
            declaredColor: finalColor,
            penaltyAdded: 4,
            totalAccumulated: 4,
            playedBy: currentPlayer.id,
            playerName: currentPlayer.name
          }]
        };
        this.addLog(`${currentPlayer.name} played Wild Draw Four (+4)! Declared ${finalColor}. Chain started (+4 penalty pending).`, 'stack');
      } else {
        // Stacked +4 onto existing chain (either +2 chain or +4 chain).
        // CRITICAL HOUSE RULE: If stacked on +2 chain or +4 chain, chain becomes or remains a '+4-only' chain!
        const newAccumulated = this.stackingChain.accumulatedPenalty + 4;
        this.stackingChain.accumulatedPenalty = newAccumulated;
        this.stackingChain.chainLength += 1;
        this.stackingChain.type = 'draw4_chain'; // Becomes +4-only chain!
        this.stackingChain.history.push({
          cardId: card.id,
          cardType: 'wild_draw4',
          cardColor: 'wild',
          declaredColor: finalColor,
          penaltyAdded: 4,
          totalAccumulated: newAccumulated,
          playedBy: currentPlayer.id,
          playerName: currentPlayer.name
        });
        this.addLog(`${currentPlayer.name} stacked Wild Draw Four (+4)! Declared ${finalColor}. Chain is now +4-ONLY with +${newAccumulated} PENALTY!`, 'stack');
      }

      this.advanceTurn(1);
      return { success: true, isStackMove: true };
    }

    // Normal cards (only possible when stackingChain is NOT active)
    this.addLog(`${currentPlayer.name} played ${card.color} ${card.value}${card.color === 'wild' ? ` (declared ${finalColor})` : ''}.`, 'play');

    if (card.value === 'skip') {
      this.advanceTurn(2);
    } else if (card.value === 'reverse') {
      if (this.players.length === 2) {
        // In 2-player UNO, reverse acts like a skip
        this.advanceTurn(2);
      } else {
        this.direction = (this.direction * -1) as 1 | -1;
        this.advanceTurn(1);
      }
    } else {
      this.advanceTurn(1);
    }

    return { success: true, isStackMove: false };
  }

  /**
   * Draw card(s) from deck.
   * If a stacking chain is active:
   * "When a player cannot continue an active draw chain, they draw the entire accumulated penalty and their turn ends."
   */
  public drawCard(playerId: string): {
    success: boolean;
    cardsDrawn: Card[];
    penaltyResolved: boolean;
    penaltyAmount: number;
    error?: string;
  } {
    if (this.status !== 'in_progress') {
      return { success: false, cardsDrawn: [], penaltyResolved: false, penaltyAmount: 0, error: 'Game is not in progress.' };
    }

    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer.id !== playerId) {
      return { success: false, cardsDrawn: [], penaltyResolved: false, penaltyAmount: 0, error: `It is not your turn! Current turn: ${currentPlayer.name}` };
    }

    // Case 1: Active stacking chain
    if (this.stackingChain.active) {
      const penalty = this.stackingChain.accumulatedPenalty;
      const drawnCards = this.drawCardsFromDeck(penalty);
      currentPlayer.hand.push(...drawnCards);
      currentPlayer.cardCount = currentPlayer.hand.length;

      this.addLog(
        `💥 ${currentPlayer.name} could not continue the chain and drew the entire accumulated penalty of +${penalty} cards! Turn ended.`,
        'stack'
      );

      // Reset stacking chain
      this.stackingChain = {
        active: false,
        type: null,
        accumulatedPenalty: 0,
        chainLength: 0,
        history: []
      };

      // Turn immediately ends!
      this.hasDrawnThisTurn = false;
      this.advanceTurn(1);

      return {
        success: true,
        cardsDrawn: drawnCards,
        penaltyResolved: true,
        penaltyAmount: penalty
      };
    }

    // Case 2: Normal draw (1 card)
    if (this.hasDrawnThisTurn) {
      return { success: false, cardsDrawn: [], penaltyResolved: false, penaltyAmount: 0, error: 'You have already drawn a card this turn. Play a card or pass.' };
    }

    const drawnCards = this.drawCardsFromDeck(1);
    currentPlayer.hand.push(...drawnCards);
    currentPlayer.cardCount = currentPlayer.hand.length;
    this.hasDrawnThisTurn = true;

    this.addLog(`${currentPlayer.name} drew a card.`, 'draw');

    return {
      success: true,
      cardsDrawn,
      penaltyResolved: false,
      penaltyAmount: 0
    };
  }

  /**
   * Pass turn after drawing a card (when no chain is active).
   */
  public passTurn(playerId: string): { success: boolean; error?: string } {
    if (this.status !== 'in_progress') {
      return { success: false, error: 'Game is not in progress.' };
    }

    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer.id !== playerId) {
      return { success: false, error: `It is not your turn! Current turn: ${currentPlayer.name}` };
    }

    if (this.stackingChain.active) {
      return { success: false, error: 'Cannot pass during an active stacking chain. You must stack or draw the penalty!' };
    }

    if (!this.hasDrawnThisTurn) {
      return { success: false, error: 'You must draw a card before passing your turn.' };
    }

    this.addLog(`${currentPlayer.name} passed their turn.`, 'info');
    this.hasDrawnThisTurn = false;
    this.advanceTurn(1);
    return { success: true };
  }

  /**
   * Loads a preset scenario for rapid manual testing of house rules.
   */
  public loadScenario(scenarioId: string, targetPlayerId?: string): boolean {
    if (this.players.length === 0) return false;
    this.status = 'in_progress';
    this.direction = 1;
    this.hasDrawnThisTurn = false;
    this.winner = null;

    const target = (targetPlayerId && this.players.find(p => p.id === targetPlayerId)) || this.players[0];
    this.currentTurnIndex = this.players.indexOf(target);

    let cid = 9000;
    const card = (color: CardColor, value: CardValue): Card => ({ id: `sc-${cid++}`, color, value });

    if (scenarioId === 'chain_2_2_2') {
      const top = card('green', 'draw2');
      this.topCard = top;
      this.discardPile = [card('red', 'draw2'), card('blue', 'draw2'), top];
      this.currentDeclaredColor = 'green';
      this.stackingChain = {
        active: true,
        type: 'draw2_chain',
        accumulatedPenalty: 6,
        chainLength: 3,
        history: [
          { cardId: 'sc-1', cardType: 'draw2', cardColor: 'red', penaltyAdded: 2, totalAccumulated: 2, playedBy: 'bot-1', playerName: 'Alice (Bot)' },
          { cardId: 'sc-2', cardType: 'draw2', cardColor: 'blue', penaltyAdded: 2, totalAccumulated: 4, playedBy: 'bot-2', playerName: 'Bob (Bot)' },
          { cardId: 'sc-3', cardType: 'draw2', cardColor: 'green', penaltyAdded: 2, totalAccumulated: 6, playedBy: 'bot-3', playerName: 'Charlie (Bot)' }
        ]
      };
      target.hand = [card('yellow', 'draw2'), card('wild', 'wild_draw4'), card('red', 7), card('blue', 3)];
      target.cardCount = target.hand.length;
      this.addLog(`Loaded scenario: +2 → +2 → +2 = +6 Penalty (+2-compatible chain)`, 'stack');
      return true;
    }

    if (scenarioId === 'chain_2_4') {
      const top = card('wild', 'wild_draw4');
      this.topCard = top;
      this.discardPile = [card('blue', 'draw2'), top];
      this.currentDeclaredColor = 'green';
      this.stackingChain = {
        active: true,
        type: 'draw4_chain',
        accumulatedPenalty: 6,
        chainLength: 2,
        history: [
          { cardId: 'sc-1', cardType: 'draw2', cardColor: 'blue', penaltyAdded: 2, totalAccumulated: 2, playedBy: 'bot-1', playerName: 'Alice (Bot)' },
          { cardId: 'sc-2', cardType: 'wild_draw4', cardColor: 'wild', declaredColor: 'green', penaltyAdded: 4, totalAccumulated: 6, playedBy: 'bot-2', playerName: 'Bob (Bot)' }
        ]
      };
      target.hand = [card('green', 'draw2'), card('wild', 'wild_draw4'), card('green', 5), card('red', 8)];
      target.cardCount = target.hand.length;
      this.addLog(`Loaded scenario: +2 → +4 = +6 Penalty (+4-ONLY chain! +2 is rejected)`, 'stack');
      return true;
    }

    if (scenarioId === 'chain_2_2_4') {
      const top = card('wild', 'wild_draw4');
      this.topCard = top;
      this.discardPile = [card('yellow', 'draw2'), card('red', 'draw2'), top];
      this.currentDeclaredColor = 'blue';
      this.stackingChain = {
        active: true,
        type: 'draw4_chain',
        accumulatedPenalty: 8,
        chainLength: 3,
        history: [
          { cardId: 'sc-1', cardType: 'draw2', cardColor: 'yellow', penaltyAdded: 2, totalAccumulated: 2, playedBy: 'bot-1', playerName: 'Alice (Bot)' },
          { cardId: 'sc-2', cardType: 'draw2', cardColor: 'red', penaltyAdded: 2, totalAccumulated: 4, playedBy: 'bot-2', playerName: 'Bob (Bot)' },
          { cardId: 'sc-3', cardType: 'wild_draw4', cardColor: 'wild', declaredColor: 'blue', penaltyAdded: 4, totalAccumulated: 8, playedBy: 'bot-3', playerName: 'Charlie (Bot)' }
        ]
      };
      target.hand = [card('blue', 'draw2'), card('wild', 'wild_draw4'), card('blue', 4), card('yellow', 9)];
      target.cardCount = target.hand.length;
      this.addLog(`Loaded scenario: +2 → +2 → +4 = +8 Penalty (+4-ONLY chain)`, 'stack');
      return true;
    }

    if (scenarioId === 'chain_4_4_4') {
      const top = card('wild', 'wild_draw4');
      this.topCard = top;
      this.discardPile = [card('wild', 'wild_draw4'), card('wild', 'wild_draw4'), top];
      this.currentDeclaredColor = 'red';
      this.stackingChain = {
        active: true,
        type: 'draw4_chain',
        accumulatedPenalty: 12,
        chainLength: 3,
        history: [
          { cardId: 'sc-1', cardType: 'wild_draw4', cardColor: 'wild', declaredColor: 'blue', penaltyAdded: 4, totalAccumulated: 4, playedBy: 'bot-1', playerName: 'Alice (Bot)' },
          { cardId: 'sc-2', cardType: 'wild_draw4', cardColor: 'wild', declaredColor: 'yellow', penaltyAdded: 4, totalAccumulated: 8, playedBy: 'bot-2', playerName: 'Bob (Bot)' },
          { cardId: 'sc-3', cardType: 'wild_draw4', cardColor: 'wild', declaredColor: 'red', penaltyAdded: 4, totalAccumulated: 12, playedBy: 'bot-3', playerName: 'Charlie (Bot)' }
        ]
      };
      target.hand = [card('red', 'draw2'), card('red', 3), card('green', 9), card('wild', 'wild')];
      target.cardCount = target.hand.length;
      this.addLog(`Loaded scenario: +4 → +4 → +4 = +12 Penalty (Player must draw 12)`, 'stack');
      return true;
    }

    if (scenarioId === 'chain_4_reject_2') {
      const top = card('wild', 'wild_draw4');
      this.topCard = top;
      this.discardPile = [card('red', 5), top];
      this.currentDeclaredColor = 'blue';
      this.stackingChain = {
        active: true,
        type: 'draw4_chain',
        accumulatedPenalty: 4,
        chainLength: 1,
        history: [
          { cardId: 'sc-1', cardType: 'wild_draw4', cardColor: 'wild', declaredColor: 'blue', penaltyAdded: 4, totalAccumulated: 4, playedBy: 'bot-1', playerName: 'Alice (Bot)' }
        ]
      };
      target.hand = [card('blue', 'draw2'), card('blue', 7), card('red', 1)];
      target.cardCount = target.hand.length;
      this.addLog(`Loaded scenario: +4 → +2 Illegal Move Test (+2 matches color but is strictly rejected)`, 'stack');
      return true;
    }

    return false;
  }

  /**
   * Advances the turn index by `steps` taking direction into account.
   */
  public advanceTurn(steps: number = 1): void {
    const total = this.players.length;
    if (total === 0) return;
    this.currentTurnIndex = (this.currentTurnIndex + (this.direction * steps) % total + total) % total;
    this.hasDrawnThisTurn = false;
  }

  /**
   * Draws n cards from draw pile, reshuffling discard pile if necessary.
   */
  public drawCardsFromDeck(count: number): Card[] {
    const drawn: Card[] = [];
    for (let i = 0; i < count; i++) {
      if (this.drawPile.length === 0) {
        if (this.discardPile.length <= 1) {
          // If discard pile also only has top card or empty, generate a fresh deck
          this.drawPile = shuffleDeck(createDeck());
        } else {
          // Reshuffle all but top card of discard pile
          const top = this.discardPile.pop()!;
          this.drawPile = shuffleDeck(this.discardPile);
          this.discardPile = [top];
        }
      }

      if (this.drawPile.length > 0) {
        drawn.push(this.drawPile.pop()!);
      }
    }
    return drawn;
  }

  /**
   * Executes AI bot turn if the current player is an AI bot.
   * Returns information about the action taken.
   */
  public playBotTurn(): {
    acted: boolean;
    action?: 'play' | 'draw' | 'pass';
    card?: Card;
    penaltyResolved?: boolean;
  } {
    if (this.status !== 'in_progress') return { acted: false };
    const bot = this.getCurrentPlayer();
    if (!bot.isBot) return { acted: false };

    // Case 1: Active stacking chain
    if (this.stackingChain.active) {
      // Find valid stacking card
      const playableCards = bot.hand.filter(c =>
        validateCardPlay(c, this.topCard, this.currentDeclaredColor, this.stackingChain).valid
      );

      if (playableCards.length > 0) {
        // If it's a +2 chain, prefer playing +2 if available, or +4 if not
        let cardToPlay: Card;
        if (this.stackingChain.type === 'draw2_chain') {
          const draw2Card = playableCards.find(c => c.value === 'draw2');
          cardToPlay = draw2Card || playableCards[0];
        } else {
          // +4 chain: only +4 is playable anyway
          cardToPlay = playableCards[0];
        }

        let declaredColor: StandardColor | undefined;
        if (cardToPlay.color === 'wild') {
          // Choose bot's most frequent color in hand
          declaredColor = this.getBotBestColor(bot);
        }

        const res = this.playCard(bot.id, cardToPlay.id, declaredColor);
        if (res.success) {
          return { acted: true, action: 'play', card: cardToPlay };
        }
      }

      // No playable stacking card: Bot draws the accumulated penalty!
      const drawRes = this.drawCard(bot.id);
      return { acted: true, action: 'draw', penaltyResolved: drawRes.penaltyResolved };
    }

    // Case 2: Normal turn (no stacking chain)
    const playableCards = bot.hand.filter(c =>
      validateCardPlay(c, this.topCard, this.currentDeclaredColor, this.stackingChain).valid
    );

    if (playableCards.length > 0) {
      // Prioritize non-wild action cards, then numbers, then wilds
      playableCards.sort((a, b) => {
        if (a.color === 'wild' && b.color !== 'wild') return 1;
        if (a.color !== 'wild' && b.color === 'wild') return -1;
        return 0;
      });

      const cardToPlay = playableCards[0];
      let declaredColor: StandardColor | undefined;
      if (cardToPlay.color === 'wild') {
        declaredColor = this.getBotBestColor(bot);
      }

      const res = this.playCard(bot.id, cardToPlay.id, declaredColor);
      if (res.success) {
        return { acted: true, action: 'play', card: cardToPlay };
      }
    }

    // No playable card: Draw 1 card
    const drawRes = this.drawCard(bot.id);
    if (drawRes.success && drawRes.cardsDrawn.length > 0) {
      const drawnCard = drawRes.cardsDrawn[0];
      const canPlayDrawn = validateCardPlay(drawnCard, this.topCard, this.currentDeclaredColor, this.stackingChain).valid;
      if (canPlayDrawn) {
        let declaredColor: StandardColor | undefined;
        if (drawnCard.color === 'wild') {
          declaredColor = this.getBotBestColor(bot);
        }
        this.playCard(bot.id, drawnCard.id, declaredColor);
        return { acted: true, action: 'play', card: drawnCard };
      } else {
        this.passTurn(bot.id);
        return { acted: true, action: 'pass' };
      }
    }

    return { acted: true, action: 'pass' };
  }

  private getBotBestColor(bot: Player): StandardColor {
    const counts: Record<StandardColor, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
    for (const c of bot.hand) {
      if (c.color !== 'wild') {
        counts[c.color as StandardColor] = (counts[c.color as StandardColor] || 0) + 1;
      }
    }
    let bestColor: StandardColor = 'red';
    let max = -1;
    for (const color of ['red', 'blue', 'green', 'yellow'] as StandardColor[]) {
      if (counts[color] > max) {
        max = counts[color];
        bestColor = color;
      }
    }
    return bestColor;
  }

  public getPublicState(forPlayerId?: string): PublicGameState {
    const publicPlayers: PublicPlayer[] = this.players.map(p => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      cardCount: p.hand.length,
      hand: forPlayerId === p.id ? p.hand : undefined
    }));

    const viewingPlayer = this.players.find(p => p.id === forPlayerId);

    return {
      id: this.id,
      players: publicPlayers,
      currentTurnIndex: this.currentTurnIndex,
      currentTurnPlayerId: this.players[this.currentTurnIndex]?.id || '',
      direction: this.direction,
      topCard: this.topCard,
      currentDeclaredColor: this.currentDeclaredColor,
      stackingChain: { ...this.stackingChain, history: [...this.stackingChain.history] },
      status: this.status,
      winner: this.winner
        ? {
            id: this.winner.id,
            name: this.winner.name,
            isBot: this.winner.isBot,
            cardCount: 0
          }
        : null,
      log: [...this.log].slice(-40),
      deckCount: this.drawPile.length,
      discardPileCount: this.discardPile.length,
      myHand: viewingPlayer ? [...viewingPlayer.hand] : []
    };
  }

  private addLog(text: string, type: GameLogEntry['type']): void {
    this.log.push({
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      text,
      type
    });
  }
}

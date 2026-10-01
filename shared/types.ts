export type CardColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild';

export type StandardColor = 'red' | 'blue' | 'green' | 'yellow';

export type CardValue =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild_draw4';

export interface Card {
  id: string;
  color: CardColor;
  value: CardValue;
}

export type ChainType = 'draw2_chain' | 'draw4_chain';

export interface StackingHistoryItem {
  cardId: string;
  cardType: 'draw2' | 'wild_draw4';
  cardColor: CardColor;
  declaredColor?: StandardColor;
  penaltyAdded: number;
  totalAccumulated: number;
  playedBy: string;
  playerName: string;
}

export interface StackingChainState {
  active: boolean;
  type: ChainType | null; // Explicit distinction: '+2-compatible chain' vs '+4-only chain'
  accumulatedPenalty: number;
  chainLength: number;
  history: StackingHistoryItem[];
}

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  hand: Card[];
  cardCount: number;
}

export interface PublicPlayer {
  id: string;
  name: string;
  isBot: boolean;
  cardCount: number;
  hand?: Card[]; // Only populated for the viewing player
}

export interface GameLogEntry {
  id: string;
  timestamp: number;
  playerId?: string;
  playerName?: string;
  text: string;
  type: 'info' | 'play' | 'draw' | 'stack' | 'error' | 'win';
}

export interface GameState {
  id: string;
  players: Player[];
  currentTurnIndex: number;
  currentTurnPlayerId: string;
  direction: 1 | -1; // 1 = clockwise, -1 = counter-clockwise
  topCard: Card;
  currentDeclaredColor: StandardColor;
  stackingChain: StackingChainState;
  status: 'waiting' | 'in_progress' | 'game_over';
  winner: Player | null;
  log: GameLogEntry[];
  deckCount: number;
  discardPileCount: number;
}

export interface PublicGameState {
  id: string;
  myPlayerId?: string;
  players: PublicPlayer[];
  currentTurnIndex: number;
  currentTurnPlayerId: string;
  direction: 1 | -1;
  topCard: Card;
  currentDeclaredColor: StandardColor;
  stackingChain: StackingChainState;
  status: 'waiting' | 'in_progress' | 'game_over';
  winner: PublicPlayer | null;
  log: GameLogEntry[];
  deckCount: number;
  discardPileCount: number;
  myHand: Card[];
}

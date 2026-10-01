import type { Card, CardColor, CardValue, StandardColor } from '../../shared/types.ts';

let nextCardId = 1;

export function createDeck(): Card[] {
  const cards: Card[] = [];
  const standardColors: StandardColor[] = ['red', 'blue', 'green', 'yellow'];

  for (const color of standardColors) {
    // One 0 card per color
    cards.push({ id: `c-${nextCardId++}`, color, value: 0 });

    // Two of each 1-9 cards per color
    for (let val = 1; val <= 9; val++) {
      cards.push({ id: `c-${nextCardId++}`, color, value: val as CardValue });
      cards.push({ id: `c-${nextCardId++}`, color, value: val as CardValue });
    }

    // Two of each action card per color (Skip, Reverse, Draw Two)
    for (let i = 0; i < 2; i++) {
      cards.push({ id: `c-${nextCardId++}`, color, value: 'skip' });
      cards.push({ id: `c-${nextCardId++}`, color, value: 'reverse' });
      cards.push({ id: `c-${nextCardId++}`, color, value: 'draw2' });
    }
  }

  // 4 Wild cards and 4 Wild Draw Four cards
  for (let i = 0; i < 4; i++) {
    cards.push({ id: `c-${nextCardId++}`, color: 'wild', value: 'wild' });
    cards.push({ id: `c-${nextCardId++}`, color: 'wild', value: 'wild_draw4' });
  }

  return cards;
}

export function shuffleDeck<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

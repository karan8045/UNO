import type { Card, GameState, StackingChainState, StandardColor } from './types.ts';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  isStackMove?: boolean;
}

/**
 * Validates whether a card can be played in the current game state,
 * enforcing the custom draw-card stacking house rules.
 */
export function validateCardPlay(
  card: Card,
  topCard: Card | null | undefined,
  currentDeclaredColor: StandardColor,
  stackingChain: StackingChainState
): ValidationResult {
  if (!card) {
    return { valid: false, reason: 'Invalid card.' };
  }
  if (!topCard) {
    return { valid: false, reason: 'Game has not started or top card is missing.' };
  }
  // If an active draw chain is in progress, stacking house rules strictly apply:
  if (stackingChain.active) {
    if (stackingChain.type === 'draw4_chain') {
      // Once a Wild Draw Four (+4) has been played in an active stacking chain:
      // - Only another +4 may be played by the next affected player.
      // - A +2 cannot be played on a +4.
      // - Normal cards cannot be played.
      // - Skip cannot be played.
      // - Reverse cannot be played.
      // - Wild cannot be played.
      // - Only +4 continues the penalty chain.
      if (card.value === 'wild_draw4') {
        return { valid: true, isStackMove: true };
      }

      if (card.value === 'draw2') {
        return {
          valid: false,
          reason: 'INVALID MOVE: A +2 cannot be played on a +4. Only Wild Draw Four (+4) can continue the penalty chain.'
        };
      }

      return {
        valid: false,
        reason: 'INVALID MOVE: Active +4 chain in progress. Only Wild Draw Four (+4) can be played, or you must draw the penalty.'
      };
    }

    if (stackingChain.type === 'draw2_chain') {
      // When a +2 chain is active:
      // - Next player may play another +2 to pass accumulated penalty onward (+2-compatible).
      // - Next player may also play a Wild Draw Four (+4) (chain becomes +4-only).
      // - Normal cards, skip, reverse, standard wild cannot be played.
      if (card.value === 'draw2') {
        return { valid: true, isStackMove: true };
      }

      if (card.value === 'wild_draw4') {
        return { valid: true, isStackMove: true };
      }

      return {
        valid: false,
        reason: 'INVALID MOVE: Active +2 chain in progress. You may only play Draw Two (+2) or Wild Draw Four (+4), or draw the penalty.'
      };
    }
  }

  // Normal UNO validation (no active stacking chain):
  // Wild cards can always be played
  if (card.value === 'wild' || card.value === 'wild_draw4') {
    return { valid: true, isStackMove: card.value === 'wild_draw4' };
  }

  // Matching color
  if (card.color === currentDeclaredColor) {
    return { valid: true, isStackMove: card.value === 'draw2' };
  }

  // Matching value / symbol
  if (card.value === topCard.value) {
    return { valid: true, isStackMove: card.value === 'draw2' };
  }

  return {
    valid: false,
    reason: `INVALID MOVE: Card ${card.color} ${card.value} does not match active color (${currentDeclaredColor}) or top card value (${topCard.value}).`
  };
}

/**
 * Checks if a player has any playable card in their hand.
 */
export function hasPlayableCard(
  hand: Card[],
  topCard: Card | null | undefined,
  currentDeclaredColor: StandardColor,
  stackingChain: StackingChainState
): boolean {
  if (!topCard || !hand) return false;
  return hand.some(card => validateCardPlay(card, topCard, currentDeclaredColor, stackingChain).valid);
}

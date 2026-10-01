import React from 'react';
import type { StackingChainState } from '../../../shared/types.ts';

interface PenaltyBannerProps {
  stackingChain: StackingChainState;
  isMyTurn: boolean;
  onDrawPenalty?: () => void;
}

export const PenaltyBanner: React.FC<PenaltyBannerProps> = ({
  stackingChain,
  isMyTurn,
  onDrawPenalty
}) => {
  if (!stackingChain || !stackingChain.active) {
    return null;
  }

  const isDraw4Chain = stackingChain.type === 'draw4_chain';

  return (
    <div className="w-full max-w-xl mx-auto my-2 z-30 transition-all duration-300">
      <div
        className={`
          relative overflow-hidden rounded-2xl p-4 shadow-2xl border-2 text-center
          ${
            isDraw4Chain
              ? 'bg-gradient-to-r from-red-950 via-rose-900 to-amber-950 border-red-500 shadow-red-600/40 animate-pulse-glow'
              : 'bg-gradient-to-r from-amber-950 via-orange-900 to-yellow-950 border-amber-400 shadow-amber-600/40 animate-pulse-glow'
          }
        `}
      >
        {/* Header row: Badge and Chain type indicator */}
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <span className="text-xs uppercase tracking-wider font-extrabold text-red-300">
              Active Draw Stack Chain ({stackingChain.chainLength} card{stackingChain.chainLength > 1 ? 's' : ''})
            </span>
          </div>

          {/* Explicit chain type distinction */}
          <div
            className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow ${
              isDraw4Chain
                ? 'bg-red-600 text-white border border-red-300 ring-2 ring-red-400/50'
                : 'bg-amber-500 text-slate-950 border border-amber-200'
            }`}
          >
            <span>{isDraw4Chain ? '🔥' : '⚡'}</span>
            <span>{isDraw4Chain ? '+4-ONLY Chain' : '+2 Compatible Chain'}</span>
          </div>
        </div>

        {/* Huge prominent penalty indicator */}
        <div className="my-2">
          <div className="text-4xl sm:text-5xl font-black tracking-tight text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
            +{stackingChain.accumulatedPenalty} PENALTY
          </div>
          <div className="text-sm sm:text-base font-bold text-amber-200 uppercase tracking-widest mt-1">
            DRAW {stackingChain.accumulatedPenalty} CARDS IF UNABLE TO STACK
          </div>
        </div>

        {/* Rule explanation subtext */}
        <div className="mt-2 text-xs text-slate-300 bg-black/40 rounded-lg p-2 max-w-md mx-auto">
          {isDraw4Chain ? (
            <p className="font-semibold text-rose-200">
              ⚠️ <span className="underline">A +4 was played:</span> Only another <strong className="text-white bg-red-700/80 px-1 py-0.5 rounded">+4</strong> may be played! +2, numbers, and action cards are <span className="text-red-400 font-bold uppercase">rejected</span>.
            </p>
          ) : (
            <p className="font-semibold text-amber-200">
              ℹ️ <span className="underline">+2 Chain:</span> You may play another <strong className="text-white bg-blue-600 px-1 py-0.5 rounded">+2</strong> (carries forward) or <strong className="text-white bg-purple-700 px-1 py-0.5 rounded">+4</strong> (switches chain to +4-only).
            </p>
          )}
        </div>

        {/* Stacking history chain steps */}
        {Array.isArray(stackingChain.history) && stackingChain.history.length > 0 && (
          <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-center gap-1.5 flex-wrap text-xs text-slate-300">
            <span className="font-bold text-slate-400 mr-1">Chain:</span>
            {stackingChain.history.map((step, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="text-slate-500 font-bold">➔</span>}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 border border-white/10">
                  <span className="font-medium text-slate-200">{step.playerName}</span>
                  <span
                    className={`font-black px-1 rounded ${
                      step.cardType === 'wild_draw4' ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'
                    }`}
                  >
                    {step.cardType === 'wild_draw4' ? '+4' : '+2'}
                  </span>
                </span>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Action button if it is user's turn */}
        {isMyTurn && onDrawPenalty && (
          <div className="mt-3">
            <button
              onClick={onDrawPenalty}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-black text-sm uppercase tracking-wider rounded-xl shadow-lg border border-red-300/40 transition-transform active:scale-95 cursor-pointer"
            >
              Draw +{stackingChain.accumulatedPenalty} Penalty Cards & End Turn
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

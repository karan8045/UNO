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
          relative overflow-hidden rounded-3xl p-5 shadow-2xl border text-center transition-all
          ${
            isDraw4Chain
              ? 'bg-[#140e14]/90 border-red-500/40 shadow-red-500/20 animate-pulse-glow'
              : 'bg-[#15110d]/90 border-brand-500/40 shadow-brand-500/20 animate-pulse-glow'
          }
          backdrop-blur-2xl
        `}
      >
        {/* Header row: Badge and Chain type indicator */}
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
            </span>
            <span className="text-[11px] uppercase tracking-wider font-extrabold text-slate-300">
              Active Stacking Chain • {stackingChain.chainLength} card{stackingChain.chainLength > 1 ? 's' : ''}
            </span>
          </div>

          {/* Explicit chain type distinction */}
          <div
            className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
              isDraw4Chain
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
            }`}
          >
            <span>{isDraw4Chain ? '🔥' : '⚡'}</span>
            <span>{isDraw4Chain ? '+4-ONLY Chain' : '+2 Compatible Chain'}</span>
          </div>
        </div>

        {/* Huge prominent penalty indicator */}
        <div className="my-3">
          <div className="text-5xl sm:text-6xl font-black tracking-tight text-white font-mono drop-shadow-[0_4px_16px_rgba(255,94,40,0.3)]">
            +{stackingChain.accumulatedPenalty}
          </div>
          <div className="text-xs sm:text-sm font-extrabold text-brand-400 uppercase tracking-widest mt-1">
            Cards Accumulated Penalty
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">
            Draw {stackingChain.accumulatedPenalty} cards if unable to continue the stack
          </div>
        </div>

        {/* Rule explanation subtext */}
        <div className="mt-2 text-xs text-slate-300 bg-white/5 border border-white/10 rounded-2xl p-3 max-w-md mx-auto">
          {isDraw4Chain ? (
            <p className="font-medium text-rose-200">
              ⚠️ <span className="underline font-bold">A +4 was played:</span> Only another <strong className="text-white bg-rose-600/80 px-1.5 py-0.5 rounded-lg">+4</strong> may be played. +2, numbers, and action cards are <span className="text-rose-400 font-bold uppercase">rejected</span>.
            </p>
          ) : (
            <p className="font-medium text-amber-200">
              ℹ️ <span className="underline font-bold">+2 Chain:</span> You may play another <strong className="text-white bg-sky-600 px-1.5 py-0.5 rounded-lg">+2</strong> (carries forward) or <strong className="text-white bg-purple-600 px-1.5 py-0.5 rounded-lg">+4</strong> (switches chain to +4-only).
            </p>
          )}
        </div>

        {/* Stacking history chain steps */}
        {Array.isArray(stackingChain.history) && stackingChain.history.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-center gap-1.5 flex-wrap text-xs text-slate-300">
            <span className="font-bold text-slate-400 mr-1 text-[11px] uppercase tracking-wider">Chain:</span>
            {stackingChain.history.map((step, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="text-slate-600 font-bold">➔</span>}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 border border-white/10">
                  <span className="font-medium text-slate-200 text-xs">{step.playerName}</span>
                  <span
                    className={`font-black text-[11px] px-1.5 py-0.5 rounded-md ${
                      step.cardType === 'wild_draw4' ? 'bg-purple-600 text-white' : 'bg-sky-600 text-white'
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
          <div className="mt-4">
            <button
              onClick={onDrawPenalty}
              className="w-full sm:w-auto px-7 py-3 bg-brand-500 hover:bg-brand-400 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-brand-500/30 transition-transform active:scale-95 cursor-pointer"
            >
              Draw +{stackingChain.accumulatedPenalty} Penalty Cards & Pass
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

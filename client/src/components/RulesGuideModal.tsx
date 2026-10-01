import React from 'react';

interface RulesGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulesGuideModal: React.FC<RulesGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-[#0e1422]/95 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 sm:p-8 max-w-2xl w-full text-slate-100 shadow-2xl my-8">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-lg text-brand-400">
              ⚡
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase">Draw-Card Stacking Engine</h2>
              <p className="text-[11px] text-brand-400 font-semibold uppercase tracking-wider">Official Server-Authoritative Logic</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white font-bold cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 space-y-4 text-sm text-slate-300 max-h-[70vh] overflow-y-auto pr-2">
          {/* +2 Chain */}
          <div className="bg-[#131b2c]/80 p-5 rounded-2xl border border-white/10 shadow-lg">
            <h3 className="text-base font-black text-sky-400 flex items-center gap-2 mb-2">
              <span>⚡</span> +2 Chain (+2 Compatible)
            </h3>
            <p className="mb-2 text-xs text-slate-300">When a player plays a <strong>Draw Two (+2)</strong>:</p>
            <ul className="list-disc list-inside space-y-1 text-xs text-slate-400 ml-1">
              <li>The next player receives a pending <strong className="text-white">+2 penalty</strong>.</li>
              <li>That player may play another <strong className="text-white">+2</strong> to pass the accumulated penalty onward.</li>
              <li>That player may also play a <strong className="text-white">Wild Draw Four (+4)</strong>.</li>
              <li>If they play +2, the chain remains a <strong className="text-sky-300">+2-compatible chain</strong>.</li>
              <li>If they play +4, the chain switches to a <strong className="text-brand-400">+4-only chain</strong>.</li>
              <li>Accumulated penalty always carries forward!</li>
            </ul>
            <div className="mt-3 bg-black/40 border border-white/10 p-3 rounded-xl font-mono text-xs text-brand-300 space-y-1.5">
              <div><code>+2 → +2 → +2</code> = next player draws <strong>6</strong> if unable to continue.</div>
              <div><code>+2 → +4</code> = next player receives total penalty of <strong>6</strong> and may play <strong>+4 only</strong>.</div>
              <div><code>+2 → +2 → +4</code> = next player receives total penalty of <strong>8</strong> and may play <strong>+4 only</strong>.</div>
            </div>
          </div>

          {/* +4 Chain */}
          <div className="bg-[#181216]/80 p-5 rounded-2xl border border-rose-500/20 shadow-lg">
            <h3 className="text-base font-black text-rose-400 flex items-center gap-2 mb-2">
              <span>🔥</span> +4 Chain (+4 Only)
            </h3>
            <p className="mb-2 text-xs text-slate-300">Once a <strong>Wild Draw Four (+4)</strong> has been played in an active chain:</p>
            <ul className="list-disc list-inside space-y-1 text-xs text-slate-400 ml-1">
              <li><strong className="text-white">Only another +4</strong> may be played by the next affected player.</li>
              <li><strong className="text-rose-400">A +2 cannot be played on a +4</strong> (authoritatively rejected).</li>
              <li>Normal cards and standard action cards (Skip, Reverse, Wild) are rejected.</li>
              <li>Only +4 continues the penalty chain.</li>
            </ul>
            <div className="mt-3 bg-black/40 border border-rose-500/20 p-3 rounded-xl font-mono text-xs text-rose-300 space-y-1.5">
              <div><code>+4 → +4 → +4</code> = next player draws <strong>12</strong> if unable to continue.</div>
              <div><code>+2 → +4 → +4</code> = next player draws <strong>10</strong> if unable to continue.</div>
              <div className="text-rose-400 font-bold"><code>+4 → +2</code> = INVALID MOVE (Server Rejected).</div>
            </div>
          </div>

          {/* Drawing & End of Turn */}
          <div className="bg-slate-800/80 p-4 rounded-2xl border border-amber-500/30">
            <h3 className="text-lg font-black text-amber-400 flex items-center gap-2 mb-2">
              <span>💥</span> Resolving the Penalty
            </h3>
            <p>
              When a player cannot continue an active draw chain (or chooses to draw), they draw the <strong>entire accumulated penalty</strong> into their hand, and their turn immediately ends.
            </p>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl cursor-pointer"
          >
            Got it, Let's Play!
          </button>
        </div>
      </div>
    </div>
  );
};

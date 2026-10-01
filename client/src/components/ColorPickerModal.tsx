import React from 'react';
import type { StandardColor } from '../../../shared/types.ts';

interface ColorPickerModalProps {
  isOpen: boolean;
  cardName: string;
  onSelectColor: (color: StandardColor) => void;
  onCancel: () => void;
}

export const ColorPickerModal: React.FC<ColorPickerModalProps> = ({
  isOpen,
  cardName,
  onSelectColor,
  onCancel
}) => {
  if (!isOpen) return null;

  const colors: Array<{ id: StandardColor; name: string; bg: string; border: string; glow: string }> = [
    { id: 'red', name: 'Red', bg: 'bg-gradient-to-br from-rose-500 to-rose-700 hover:from-rose-400 hover:to-rose-600', border: 'border-rose-400/40', glow: 'shadow-rose-500/30' },
    { id: 'blue', name: 'Blue', bg: 'bg-gradient-to-br from-sky-500 to-blue-700 hover:from-sky-400 hover:to-blue-600', border: 'border-sky-400/40', glow: 'shadow-sky-500/30' },
    { id: 'green', name: 'Green', bg: 'bg-gradient-to-br from-emerald-500 to-teal-700 hover:from-emerald-400 hover:to-teal-600', border: 'border-emerald-400/40', glow: 'shadow-emerald-500/30' },
    { id: 'yellow', name: 'Yellow', bg: 'bg-gradient-to-br from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950', border: 'border-amber-300/40', glow: 'shadow-amber-500/30' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
      <div className="bg-[#0f1624]/95 backdrop-blur-2xl border border-white/10 rounded-[32px] p-7 max-w-sm w-full text-center shadow-2xl">
        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 mx-auto flex items-center justify-center text-xl mb-3 shadow-inner">
          🎨
        </div>
        <h2 className="text-xl font-black text-white tracking-tight uppercase">Choose Declared Color</h2>
        <p className="text-xs text-slate-400 mt-1 mb-6">
          Playing <strong className="text-white font-semibold">{cardName}</strong>. Select the next color:
        </p>

        <div className="grid grid-cols-2 gap-3">
          {colors.map(c => (
            <button
              key={c.id}
              onClick={() => onSelectColor(c.id)}
              className={`
                h-20 rounded-2xl flex flex-col items-center justify-center font-bold text-sm tracking-wide
                ${c.bg} border ${c.border} shadow-lg ${c.glow} transition-all duration-150 active:scale-95 cursor-pointer
              `}
            >
              <div className="w-3.5 h-3.5 rounded-full bg-white/60 mb-1.5 shadow-sm"></div>
              <span>{c.name}</span>
            </button>
          ))}
        </div>

        <button
          onClick={onCancel}
          className="mt-6 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer font-semibold uppercase tracking-wider"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

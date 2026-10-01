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

  const colors: Array<{ id: StandardColor; name: string; bg: string; border: string }> = [
    { id: 'red', name: 'Red', bg: 'bg-red-500 hover:bg-red-400', border: 'border-red-300' },
    { id: 'blue', name: 'Blue', bg: 'bg-blue-500 hover:bg-blue-400', border: 'border-blue-300' },
    { id: 'green', name: 'Green', bg: 'bg-emerald-500 hover:bg-emerald-400', border: 'border-emerald-300' },
    { id: 'yellow', name: 'Yellow', bg: 'bg-amber-400 hover:bg-amber-300 text-slate-900', border: 'border-amber-200' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-slate-800 border-2 border-slate-600 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl">
        <h2 className="text-2xl font-black text-white tracking-wide">Choose Declared Color</h2>
        <p className="text-sm text-slate-300 mt-1 mb-6">
          Playing <span className="font-bold text-amber-300">{cardName}</span>. Which color should the next card match?
        </p>

        <div className="grid grid-cols-2 gap-4">
          {colors.map(c => (
            <button
              key={c.id}
              onClick={() => onSelectColor(c.id)}
              className={`
                h-20 rounded-2xl flex flex-col items-center justify-center font-black text-lg
                ${c.bg} border-2 ${c.border} shadow-lg transition-transform active:scale-95 cursor-pointer
              `}
            >
              <div className="w-4 h-4 rounded-full bg-white/40 mb-1"></div>
              <span>{c.name}</span>
            </button>
          ))}
        </div>

        <button
          onClick={onCancel}
          className="mt-6 text-sm text-slate-400 hover:text-white underline cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

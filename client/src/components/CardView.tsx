import React from 'react';
import type { Card } from '../../../shared/types.ts';

interface CardViewProps {
  card: Card;
  isPlayable?: boolean;
  isDisabled?: boolean;
  disabledReason?: string;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  isTopCard?: boolean;
}

export const CardView: React.FC<CardViewProps> = ({
  card,
  isPlayable = true,
  isDisabled = false,
  disabledReason,
  onClick,
  size = 'md',
  isTopCard = false
}) => {
  if (!card) return null;

  // Dimensions based on size
  const sizeClasses = {
    sm: 'w-14 h-20 text-xs rounded-xl',
    md: 'w-24 h-36 text-sm rounded-2xl',
    lg: 'w-32 h-48 text-base rounded-[24px]'
  }[size];

  // Background gradient/color based on card color
  const colorStyles: Record<string, string> = {
    red: 'bg-gradient-to-br from-[#e11d48] to-[#881337] border-rose-400/30 text-white shadow-rose-950/60',
    blue: 'bg-gradient-to-br from-[#0ea5e9] to-[#0369a1] border-sky-400/30 text-white shadow-sky-950/60',
    green: 'bg-gradient-to-br from-[#10b981] to-[#047857] border-emerald-400/30 text-white shadow-emerald-950/60',
    yellow: 'bg-gradient-to-br from-[#fbbf24] to-[#d97706] border-amber-300/40 text-slate-950 shadow-amber-950/60',
    wild: 'bg-gradient-to-tr from-[#ec4899] via-[#ff5e28] to-[#0ea5e9] border-white/40 text-white shadow-orange-950/60'
  };

  const getDisplayValue = () => {
    switch (card.value) {
      case 'draw2':
        return '+2';
      case 'wild_draw4':
        return '+4';
      case 'wild':
        return 'WILD';
      case 'skip':
        return '⊘';
      case 'reverse':
        return '⇄';
      default:
        return card.value.toString();
    }
  };

  const displayVal = getDisplayValue();

  return (
    <div
      onClick={!isDisabled && isPlayable ? onClick : undefined}
      title={isDisabled && disabledReason ? disabledReason : undefined}
      style={{
        boxShadow: isTopCard
          ? '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)'
          : undefined
      }}
      className={`
        relative select-none border-2 transition-all duration-200 flex flex-col justify-between p-1.5
        ${sizeClasses}
        ${colorStyles[card.color] || colorStyles.red}
        ${
          isDisabled
            ? 'opacity-30 grayscale cursor-not-allowed scale-95 border-dashed border-gray-600'
            : isPlayable
            ? 'cursor-pointer hover:-translate-y-3 hover:scale-105 hover:shadow-xl hover:z-20 active:scale-95'
            : 'opacity-60 cursor-default'
        }
      `}
    >
      {/* Top Left Corner */}
      <div className="font-extrabold text-left leading-none tracking-tight pl-0.5 pt-0.5">
        <span className="drop-shadow">{displayVal}</span>
      </div>

      {/* Center Oval graphic */}
      <div className="relative mx-auto my-auto flex items-center justify-center w-4/5 h-3/5 rounded-full bg-white/90 shadow-inner transform -rotate-12 border border-black/10">
        <span
          className={`font-black tracking-tighter drop-shadow-md ${
            size === 'sm' ? 'text-sm' : size === 'md' ? 'text-2xl' : 'text-3xl'
          } ${
            card.color === 'yellow'
              ? 'text-amber-600'
              : card.color === 'red'
              ? 'text-red-600'
              : card.color === 'blue'
              ? 'text-blue-600'
              : card.color === 'green'
              ? 'text-emerald-600'
              : 'text-transparent bg-clip-text bg-gradient-to-r from-red-600 via-yellow-500 to-blue-600'
          }`}
        >
          {displayVal}
        </span>
      </div>

      {/* Bottom Right Corner */}
      <div className="font-extrabold text-right leading-none tracking-tight pr-0.5 pb-0.5 transform rotate-180">
        <span className="drop-shadow">{displayVal}</span>
      </div>

      {/* Disabled Badge overlay on hover or when disabled */}
      {isDisabled && (
        <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center p-1 text-center">
          <span className="text-[10px] font-bold text-red-300 leading-tight">
            {card.value === 'draw2' ? 'No +2 on +4' : 'Invalid in chain'}
          </span>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { Lock } from 'lucide-react';

interface ConsoleButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: 'crimson' | 'amber' | 'emerald' | 'cyan';
  size?: 'xs' | 'sm' | 'md';
  manualOnlyReason?: string;
  fullWidth?: boolean;
  title?: string;
  disabled?: boolean;
}

export const ConsoleButton: React.FC<ConsoleButtonProps> = ({
  label,
  active,
  onClick,
  color = 'amber',
  size = 'sm',
  manualOnlyReason,
  fullWidth = false,
  title,
  disabled = false,
}) => {
  const activeStyles = {
    crimson:
      'bg-rose-600/90 text-white border-rose-400/80 shadow-[0_0_12px_rgba(225,29,72,0.55),inset_0_1px_0_rgba(255,255,255,0.3)]',
    amber:
      'bg-amber-500/90 text-slate-950 font-bold border-amber-300/80 shadow-[0_0_12px_rgba(245,158,11,0.5),inset_0_1px_0_rgba(255,255,255,0.4)]',
    emerald:
      'bg-emerald-500/90 text-slate-950 font-bold border-emerald-300/80 shadow-[0_0_10px_rgba(16,185,129,0.45),inset_0_1px_0_rgba(255,255,255,0.35)]',
    cyan:
      'bg-sky-500/90 text-slate-950 font-bold border-sky-300/80 shadow-[0_0_10px_rgba(14,165,233,0.45),inset_0_1px_0_rgba(255,255,255,0.35)]',
  };

  const inactiveStyle = 'console-hw-btn-off hover:border-slate-500';

  const sizeClass =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[9px] min-h-[22px]'
      : size === 'md'
        ? 'px-3 py-1.5 text-xs min-h-[34px]'
        : 'px-2 py-1 text-[10px] min-h-[26px]';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={manualOnlyReason ?? title}
      className={`relative rounded-[4px] border font-mono tracking-wide whitespace-nowrap shrink-0 flex items-center justify-center gap-1 transition-all active:translate-y-[1px] select-none disabled:opacity-45 disabled:cursor-not-allowed ${sizeClass} ${
        fullWidth ? 'w-full' : ''
      } ${active ? activeStyles[color] : inactiveStyle} ${
        manualOnlyReason ? 'opacity-75' : ''
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          active
            ? 'bg-white shadow-[0_0_4px_#fff]'
            : color === 'crimson'
              ? 'bg-rose-950'
              : color === 'emerald'
                ? 'bg-emerald-950'
                : color === 'cyan'
                  ? 'bg-sky-950'
                  : 'bg-amber-950'
        }`}
      />
      <span>{label}</span>
      {manualOnlyReason && <Lock className="w-2.5 h-2.5 text-amber-300/80 ml-0.5" />}
    </button>
  );
};

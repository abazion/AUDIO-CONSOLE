import React from 'react';
import type { ChannelStrip, DcaGroupId } from '../../engine/types';

interface ScribbleStripProps {
  channel: ChannelStrip;
  selected: boolean;
  onSelect: () => void;
  onOpenSource?: () => void;
  onToggleDcaSpill?: (dca: DcaGroupId) => void;
  isManualHardwarePreamp: boolean;
}

const COLOR_BAR: Record<ChannelStrip['color'], string> = {
  amber: 'bg-amber-400',
  cyan: 'bg-sky-400',
  emerald: 'bg-emerald-400',
  rose: 'bg-rose-400',
  violet: 'bg-violet-400',
  slate: 'bg-slate-400',
};

export const ScribbleStrip: React.FC<ScribbleStripProps> = ({
  channel,
  selected,
  onSelect,
  onOpenSource,
  onToggleDcaSpill,
  isManualHardwarePreamp,
}) => {
  const binding = channel.sourceBinding;
  const sourceTag = binding?.active
    ? binding.kind.toUpperCase()
    : isManualHardwarePreamp
      ? 'DESK'
      : 'HA';

  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect();
      }}
      style={
        selected
          ? {
              borderColor: 'var(--console-accent-border)',
              boxShadow: '0 0 12px var(--console-accent-soft)',
            }
          : undefined
      }
      className="w-full oled-display rounded-[4px] overflow-hidden text-left transition-all cursor-pointer hover:border-sky-400/40"
    >
      <div className={`h-1 w-full ${COLOR_BAR[channel.color]}`} />
      <div className="px-1.5 py-1">
        <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
          <div className="flex items-center gap-1 min-w-0">
            <span>CH {String(channel.number).padStart(2, '0')}</span>
            {channel.dcaGroup && (
              <span
                onClick={(e) => {
                  if (onToggleDcaSpill) {
                    e.stopPropagation();
                    onToggleDcaSpill(channel.dcaGroup!);
                  }
                }}
                className="px-1 py-[0.5px] rounded bg-amber-500/20 border border-amber-400/50 text-amber-200 text-[8px] font-bold hover:bg-amber-500/35 transition-colors"
                title={`DCA Group ${channel.dcaGroup} · Click to Spill`}
              >
                {channel.dcaGroup}
              </span>
            )}
          </div>
          <span
            onClick={(e) => {
              if (onOpenSource) {
                e.stopPropagation();
                onOpenSource();
              }
            }}
            className={`px-1 rounded ${
              binding?.active
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : isManualHardwarePreamp
                  ? 'text-amber-300/90 hover:bg-white/10'
                  : 'text-sky-300/90 hover:bg-white/10'
            }`}
            title="Click to patch Mic, Desktop Audio, or File"
          >
            {sourceTag}
          </span>
        </div>
        <div className="text-[11px] font-semibold text-slate-100 truncate leading-tight mt-0.5">
          {channel.shortName}
        </div>
        <div className="text-[9px] text-slate-400 truncate leading-tight">
          {binding?.active ? binding.label : channel.physicalPort}
        </div>
      </div>
    </div>
  );
};

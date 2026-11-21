import React, { useMemo, useState } from 'react';
import { Search, GitBranch, ArrowRight, X } from 'lucide-react';
import { useAudioConsole, WORKSPACE_GROUPS } from '../../engine/store';

interface GlobalSearchModalProps {
  open: boolean;
  onClose: () => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ open, onClose }) => {
  const { channels, buses, speakers, setWorkspace, setSelectedChannelId, openSignalJourney } =
    useAudioConsole();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items: {
      id: string;
      kind: string;
      title: string;
      subtitle: string;
      onOpen: () => void;
      onTrace?: () => void;
    }[] = [];

    WORKSPACE_GROUPS.forEach((grp) => {
      grp.workspaces.forEach((ws) => {
        items.push({
          id: `ws-${ws.id}`,
          kind: 'Workspace',
          title: ws.label,
          subtitle: grp.label,
          onOpen: () => {
            setWorkspace(grp.id, ws.id);
            onClose();
          },
        });
      });
    });

    channels.forEach((ch) => {
      items.push({
        id: ch.id,
        kind: 'Channel',
        title: `CH ${String(ch.number).padStart(2, '0')} · ${ch.name}`,
        subtitle: `${ch.micOrDiModel} · ${ch.physicalPort}`,
        onOpen: () => {
          setSelectedChannelId(ch.id);
          setWorkspace('inputs', 'live-console');
          onClose();
        },
        onTrace: () => {
          onClose();
          openSignalJourney(ch.id);
        },
      });
    });

    buses.forEach((b) => {
      items.push({
        id: b.id,
        kind: 'Bus',
        title: b.name,
        subtitle: `Kind: ${b.kind} · Fader ${b.faderDb.toFixed(1)} dB`,
        onOpen: () => {
          setWorkspace('routing', 'universal-routing');
          onClose();
        },
        onTrace: () => {
          onClose();
          openSignalJourney(b.id);
        },
      });
    });

    speakers.forEach((s) => {
      items.push({
        id: s.id,
        kind: 'Speaker Output',
        title: s.name,
        subtitle: `${s.physicalConnector} · ${s.family} ${s.hpfHz}–${s.lpfHz} Hz`,
        onOpen: () => {
          setWorkspace('routing', 'speaker-management');
          onClose();
        },
        onTrace: () => {
          onClose();
          openSignalJourney(s.id);
        },
      });
    });

    if (!q) return items.slice(0, 14);
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.subtitle.toLowerCase().includes(q) ||
        i.kind.toLowerCase().includes(q)
    );
  }, [query, channels, buses, speakers, setWorkspace, setSelectedChannelId, openSignalJourney, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-start justify-center pt-20 p-4">
      <div className="console-chassis border rounded-lg w-full max-w-2xl overflow-hidden">
        <div className="px-4 py-3 console-header-bar border-b flex items-center gap-3">
          <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--console-accent)' }} />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find source, channel, bus, speaker output, or workspace..."
            className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto divide-y divide-white/[0.05]">
          {results.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">No matching console nodes found.</div>
          ) : (
            results.map((item) => (
              <div
                key={item.id}
                className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-white/[0.03]"
              >
                <button
                  type="button"
                  onClick={item.onOpen}
                  className="text-left min-w-0 flex-1"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      style={{ color: 'var(--console-accent-text)' }}
                      className="font-mono text-[10px] w-24 shrink-0"
                    >
                      {item.kind}
                    </span>
                    <span className="font-medium text-slate-100 truncate">{item.title}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate pl-26">{item.subtitle}</div>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  {item.onTrace && (
                    <button
                      type="button"
                      onClick={item.onTrace}
                      className="px-2 py-1 rounded console-btn-surface text-[10px] font-mono text-sky-300 flex items-center gap-1"
                    >
                      <GitBranch className="w-3 h-3" />
                      <span>Trace</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={item.onOpen}
                    className="p-1.5 rounded console-btn-surface text-slate-300 hover:text-white"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

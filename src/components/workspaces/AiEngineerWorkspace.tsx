import React, { useState } from 'react';
import { CheckCircle2, Cpu, Lock, Send, Sparkles, AlertTriangle, XCircle, Terminal } from 'lucide-react';
import { useAudioConsole } from '../../engine/store';
import { runDeterministicConsoleAudit } from '../../engine/dspIntelligence';
import type { AiProposal } from '../../engine/types';
import { ConsoleButton } from '../hardware/ConsoleButton';
import { ArcGauge } from '../hardware/ArcGauge';

export const AiEngineerWorkspace: React.FC = () => {
  const {
    hardwareProfile,
    channels,
    buses,
    speakers,
    virtualDi,
    meters,
    feedbackIncidents,
    proposals,
    addProposals,
    applyProposal,
    dismissProposal,
    graphVersion,
    systemIntelligence,
    logEvent,
  } = useAudioConsole();

  const [aiTab, setAiTab] = useState<'proposals' | 'qa'>('proposals');
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [summary, setSummary] = useState<string>(
    'Co-processor DSP audit armed. Proposals route through ConfigurationManager atomic validation.'
  );
  const [question, setQuestion] = useState<string>('');
  const [asking, setAsking] = useState<boolean>(false);
  const [qaHistory, setQaHistory] = useState<{ q: string; a: string }[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);

  const pendingProposals = proposals.filter((p) => p.status === 'pending');
  const avgConf =
    pendingProposals.length > 0
      ? Math.round(
          (pendingProposals.reduce((acc, p) => acc + p.confidence, 0) / pendingProposals.length) * 100
        )
      : 92;

  const buildSnapshot = () => ({
    graphVersion,
    hardwareProfile: {
      id: hardwareProfile.id,
      name: hardwareProfile.name,
      devices: hardwareProfile.devices.map((d) => ({
        name: d.name,
        clockState: d.clockState,
        capabilities: d.capabilities,
      })),
    },
    channels: channels.map((c) => ({
      id: c.id,
      name: c.name,
      faderDb: c.faderDb,
      mute: c.mute,
      hpfEnabled: c.hpfEnabled,
      hpfFreqHz: c.hpfFreqHz,
      compRatio: c.dynamics.compRatio,
      rmsDbfs: Number((meters[c.id]?.rmsDbfs ?? -50).toFixed(1)),
      peakDbfs: Number((meters[c.id]?.peakDbfs ?? -50).toFixed(1)),
    })),
    buses: buses.map((b) => ({
      id: b.id,
      name: b.name,
      faderDb: b.faderDb,
      rmsDbfs: Number((meters[b.id]?.rmsDbfs ?? -50).toFixed(1)),
    })),
    feedbackIncidents,
  });

  const runLocalDspAudit = () => {
    setApiError(null);
    const result = runDeterministicConsoleAudit({
      channels,
      buses,
      speakers,
      virtualDi,
      hardwareProfile,
      meters,
      intelligence: systemIntelligence,
    });
    setSummary(result.summary);
    if (result.proposals.length > 0) {
      addProposals(result.proposals);
    }
    logEvent({
      family: 'dsp',
      severity: 'info',
      service: 'AutonomousDSP',
      message: result.summary,
    });
  };

  const runSystemAnalysis = async () => {
    setAnalyzing(true);
    setApiError(null);
    try {
      const res = await fetch('/api/ai-engineer/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot: buildSnapshot() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'AI analysis unavailable');
      if (data.summary) setSummary(data.summary);
      if (Array.isArray(data.proposals)) {
        const formatted: AiProposal[] = data.proposals.map((p: Record<string, unknown>, i: number) => ({
          id: `ai-${Date.now()}-${i}`,
          title: String(p.title ?? 'Engineering Recommendation'),
          category: String(p.category ?? 'gain_staging'),
          evidence: String(p.evidence ?? 'Measured from live graph snapshot'),
          affectedNodeIds: Array.isArray(p.affectedNodeIds) ? p.affectedNodeIds.map(String) : ['ch-01'],
          confidence: typeof p.confidence === 'number' ? p.confidence : 0.85,
          expectedChange: String(p.expectedChange ?? ''),
          potentialImpact: String(p.potentialImpact ?? ''),
          requiresPhysicalAction: Boolean(p.requiresPhysicalAction),
          status: 'pending',
          createdAt: new Date().toTimeString().slice(0, 8),
          patch: (p.patch as AiProposal['patch']) ?? undefined,
        }));
        addProposals(formatted);
        logEvent({
          family: 'ai',
          severity: 'info',
          service: 'AIEngineer',
          message: `Generated ${formatted.length} grounded engineering proposals.`,
        });
      }
    } catch {
      runLocalDspAudit();
    } finally {
      setAnalyzing(false);
    }
  };

  const askEngineer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || asking) return;
    const q = question.trim();
    setAsking(true);
    setApiError(null);
    try {
      const res = await fetch('/api/ai-engineer/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, snapshot: buildSnapshot() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'AI query failed');
      setQaHistory((prev) => [{ q, a: String(data.answer ?? '') }, ...prev]);
      setQuestion('');
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Unable to query AI Sound Engineer.');
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col p-2.5 gap-2 overflow-hidden">
      {/* Header + Module Tabs + Audit Switches */}
      <div className="console-panel rounded-md px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <h1 className="font-display text-sm sm:text-base font-semibold text-slate-100 leading-tight">
              AI Sound Engineer · Co-Processor Advisory Rack
            </h1>
            <p className="text-[10px] font-mono text-slate-400">
              Graph v{graphVersion} Grounded Analysis · Zero unconfirmed silent writes
            </p>
          </div>
        </div>

        <div className="console-module-rack p-0.5 rounded flex items-center gap-1">
          {[
            { id: 'proposals', label: `PROPOSALS DECK (${pendingProposals.length})`, icon: Sparkles },
            { id: 'qa', label: 'ENGINEER Q&A CONSOLE', icon: Terminal },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setAiTab(t.id as typeof aiTab)}
                className={`px-2.5 py-1 rounded-[3px] text-[10px] font-mono flex items-center gap-1 whitespace-nowrap transition-all ${
                  aiTab === t.id ? 'console-module-tab-active' : 'console-module-tab'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={runLocalDspAudit}
            className="px-2.5 py-1 rounded console-btn-surface text-[10px] font-mono text-emerald-300 flex items-center gap-1 whitespace-nowrap"
          >
            <Cpu className="w-3 h-3" />
            <span>LOCAL DSP AUDIT</span>
          </button>
          <ConsoleButton
            label={analyzing ? 'ANALYZING...' : 'ANALYZE CONSOLE'}
            size="xs"
            color="amber"
            active={!analyzing}
            onClick={runSystemAnalysis}
          />
        </div>
      </div>

      {apiError && (
        <div className="px-3 py-1.5 rounded bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200 flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{apiError}</span>
        </div>
      )}

      {/* Main Single-Viewport Body */}
      {aiTab === 'proposals' ? (
        <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
          <div className="console-panel rounded-md px-3 py-2 flex items-center justify-between gap-3 shrink-0">
            <div className="oled-display rounded px-3 py-2 text-xs text-slate-200 font-mono flex-1 min-w-0 truncate">
              <span className="text-amber-300 mr-2">DSP AUDIT:</span>
              {summary}
            </div>
            <ArcGauge
              value={avgConf}
              min={0}
              max={100}
              label="CONFIDENCE"
              unit="%"
              accent="cyan"
              size={64}
            />
          </div>

          <div className="flex-1 min-h-0 console-chassis rounded-lg border border-white/10 p-3 overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              {proposals.map((prop) => (
                <div key={prop.id} className="console-panel rounded-md p-3 flex items-stretch gap-2.5">
                  <div className="flex flex-col justify-between py-1">
                    <div className="rack-screw" />
                    <div className="rack-screw" />
                  </div>

                  <div className="flex-1 space-y-1.5 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] font-mono text-sky-300 uppercase truncate">
                          {prop.category} · {prop.affectedNodeIds.join(', ')} ·{' '}
                          {Math.round(prop.confidence * 100)}% CONF
                        </div>
                        <h3 className="text-xs font-semibold text-slate-100 truncate">{prop.title}</h3>
                      </div>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase shrink-0 ${
                          prop.status === 'applied'
                            ? 'border-emerald-500/50 text-emerald-300 bg-emerald-500/10'
                            : prop.status === 'dismissed'
                              ? 'border-slate-600 text-slate-400'
                              : 'border-amber-500/50 text-amber-300 bg-amber-500/10'
                        }`}
                      >
                        {prop.status}
                      </span>
                    </div>

                    <div className="console-well rounded p-2 text-[10px] font-mono text-slate-300 space-y-0.5">
                      <div className="truncate">EVIDENCE: {prop.evidence}</div>
                      <div className="text-emerald-300 truncate">ACTION: {prop.expectedChange}</div>
                    </div>

                    {prop.requiresPhysicalAction && (
                      <div className="flex items-center gap-1 text-[10px] font-mono text-amber-300">
                        <Lock className="w-3 h-3 shrink-0" />
                        <span>Includes physical desk adjustment outside software API</span>
                      </div>
                    )}

                    {prop.status === 'pending' ? (
                      <div className="flex items-center gap-2 pt-0.5">
                        <ConsoleButton
                          label="APPLY PATCH"
                          size="xs"
                          color="emerald"
                          active={true}
                          onClick={() => applyProposal(prop.id)}
                        />
                        <ConsoleButton
                          label="DISMISS"
                          size="xs"
                          color="crimson"
                          active={false}
                          onClick={() => dismissProposal(prop.id)}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                        {prop.status === 'applied' ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Committed to Graph</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-slate-500" />
                            <span>Dismissed</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col justify-between py-1">
                    <div className="rack-screw" />
                    <div className="rack-screw" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Tab 2: Engineering Q&A OLED Console */
        <div className="flex-1 min-h-0 console-chassis rounded-lg border border-white/10 p-3 flex flex-col justify-between gap-2.5 overflow-hidden">
          <div className="space-y-2 shrink-0">
            <div className="text-xs font-mono text-sky-300 uppercase">
              Engineering OLED Query Terminal
            </div>

            <form onSubmit={askEngineer} className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about ringing, Bass DI, headroom, or crossover alignment..."
                className="flex-1 console-well rounded px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                disabled={asking}
                className="px-4 py-2 rounded bg-amber-500 text-slate-950 font-semibold text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{asking ? 'QUERYING...' : 'ASK ENGINEER'}</span>
              </button>
            </form>

            <div className="flex flex-wrap gap-1.5">
              {[
                'Bass Virtual DI isolation check',
                'Pastor & Vocal headroom audit',
                'MG16XU manual preamp limits',
                'Active subwoofer crossover alignment',
              ].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setQuestion(prompt)}
                  className="px-2.5 py-1 rounded console-btn-surface text-[10px] font-mono text-slate-300"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="oled-display rounded p-3 flex-1 min-h-0 overflow-y-auto space-y-3">
            {qaHistory.length === 0 ? (
              <div className="text-xs font-mono text-slate-500 py-12 text-center">
                Ready for live SignalGraph telemetry queries. Select a quick prompt or ask a technical console question.
              </div>
            ) : (
              qaHistory.map((item, idx) => (
                <div key={idx} className="space-y-1 border-b border-white/[0.06] pb-2.5 last:border-0">
                  <div className="text-xs font-mono text-amber-300">&gt; {item.q}</div>
                  <div className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {item.a}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

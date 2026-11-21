import React, { useEffect, useState } from 'react';
import { UnifiedAudioEngineProvider, useAudioConsole } from './engine/store';
import { MasterSystemBar } from './components/shell/MasterSystemBar';
import { TransportStrip } from './components/shell/TransportStrip';
import { SystemTelemetryPanel } from './components/shell/SystemTelemetryPanel';
import { SignalJourneyModal } from './components/shell/SignalJourneyModal';
import { GlobalSearchModal } from './components/shell/GlobalSearchModal';
import { AudioSourcePatchModal } from './components/shell/AudioSourcePatchModal';
import { GainStagingAssistantModal } from './components/shell/GainStagingAssistantModal';
import { MasterSystemOverview } from './components/workspaces/MasterSystemOverview';
import { LiveSoundConsole } from './components/workspaces/LiveSoundConsole';
import { MicIntelligenceWorkspace } from './components/workspaces/MicIntelligenceWorkspace';
import { InstrumentIntelligenceWorkspace } from './components/workspaces/InstrumentIntelligenceWorkspace';
import { VirtualDiWorkspace } from './components/workspaces/VirtualDiWorkspace';
import { DspEqWorkspace } from './components/workspaces/DspEqWorkspace';
import { FeedbackDetectionWorkspace } from './components/workspaces/FeedbackDetectionWorkspace';
import { AcousticAnalyzerWorkspace } from './components/workspaces/AcousticAnalyzerWorkspace';
import { UniversalRoutingWorkspace } from './components/workspaces/UniversalRoutingWorkspace';
import { SpeakerManagementWorkspace } from './components/workspaces/SpeakerManagementWorkspace';
import { LivestreamStudioWorkspace } from './components/workspaces/LivestreamStudioWorkspace';
import { SoundCheckWorkspace } from './components/workspaces/SoundCheckWorkspace';
import { PresetsWorkspace } from './components/workspaces/PresetsWorkspace';
import { AiEngineerWorkspace } from './components/workspaces/AiEngineerWorkspace';
import { SystemDiagnosticsWorkspace } from './components/workspaces/SystemDiagnosticsWorkspace';

function ConsoleShell() {
  const { activeWorkspace } = useAudioConsole();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const renderWorkspace = () => {
    switch (activeWorkspace) {
      case 'master-overview':
        return <MasterSystemOverview />;
      case 'live-console':
        return <LiveSoundConsole />;
      case 'mic-intelligence':
        return <MicIntelligenceWorkspace />;
      case 'instrument-intelligence':
        return <InstrumentIntelligenceWorkspace />;
      case 'virtual-di':
        return <VirtualDiWorkspace />;
      case 'dsp-eq':
        return <DspEqWorkspace />;
      case 'feedback-detection':
        return <FeedbackDetectionWorkspace />;
      case 'acoustic-analyzer':
        return <AcousticAnalyzerWorkspace />;
      case 'universal-routing':
        return <UniversalRoutingWorkspace />;
      case 'speaker-management':
        return <SpeakerManagementWorkspace />;
      case 'livestream-studio':
        return <LivestreamStudioWorkspace />;
      case 'sound-check':
        return <SoundCheckWorkspace />;
      case 'presets-profiles':
        return <PresetsWorkspace />;
      case 'ai-engineer':
        return <AiEngineerWorkspace />;
      case 'system-diagnostics':
        return <SystemDiagnosticsWorkspace />;
      default:
        return <LiveSoundConsole />;
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden console-shell-bg text-slate-100 flex flex-col transition-colors duration-200">
      <MasterSystemBar onOpenSearch={() => setSearchOpen(true)} />
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <main className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
          {renderWorkspace()}
        </main>
        <SystemTelemetryPanel />
      </div>
      <TransportStrip />
      <SignalJourneyModal />
      <AudioSourcePatchModal />
      <GainStagingAssistantModal />
      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <UnifiedAudioEngineProvider>
      <ConsoleShell />
    </UnifiedAudioEngineProvider>
  );
}

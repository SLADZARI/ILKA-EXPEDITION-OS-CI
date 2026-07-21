import { useEffect, useMemo, useState } from 'react';
import type { AppBootstrap } from '../application/projections/bootstrap';
import {
  applyParticipantCommandOverlay,
  type ConnectivityState,
} from '../application/projections/participant-command-overlay';
import { resolvePreviewBootstrap } from '../dev/preview-bootstrap';
import { PreviewLauncher } from '../dev/PreviewLauncher';
import { PreviewSwitcher } from '../dev/PreviewSwitcher';
import { AppShell } from '../layout/AppShell';
import type { NavigationItem } from '../navigation/BottomNavigation';
import {
  IndexedDbCommandQueue,
  type OfflineQueueableCommand,
  type QueuedCommand,
} from '../application/offline/OfflineCommandQueue';
import { CommandDispatcher } from '../application/commands/CommandDispatcher';
import { OfflineCommandSynchronizer } from '../application/sync/OfflineCommandSynchronizer';
import { createAcknowledgeCardCommand, createCompleteTaskCommand, createStartTaskCommand } from '../application/commands/task';
import { createCloseExpeditionCommand } from '../application/commands/closeExpedition';
import { TodayScreen } from '../screens/participant/TodayScreen';
import { ProductRoleDetailScreen } from '../screens/participant/ProductRoleDetailScreen';
import { ProductDecisionVoteScreen } from '../screens/participant/ProductDecisionVoteScreen';
import { GamificationScreen } from '../screens/participant/GamificationScreen';
import { DayOverviewScreen } from '../screens/captain/DayOverviewScreen';
import { StageControlScreen } from '../screens/captain/StageControlScreen';
import { RecoveryDayScreen } from '../screens/captain/RecoveryDayScreen';
import { stagePathFixture } from '../dev/stage-path.fixture';
import { EmptyState } from '../components/system/EmptyState';

const queue = new IndexedDbCommandQueue();
const participantDispatcher = new CommandDispatcher(queue);

function currentConnectivity(): ConnectivityState {
  if (typeof navigator === 'undefined') return 'unknown';
  return navigator.onLine ? 'online' : 'offline';
}

function upsertQueuedCommand(items: QueuedCommand[], queued: QueuedCommand): QueuedCommand[] {
  const index = items.findIndex((item) => item.local_id === queued.local_id);
  if (index < 0) return [...items, queued];
  return items.map((item, itemIndex) => itemIndex === index ? queued : item);
}

function ParticipantApp({ bootstrap }: { bootstrap: Extract<AppBootstrap, { mode: 'participant' }> }) {
  const [authoritative, setAuthoritative] = useState(bootstrap.today);
  const [queuedCommands, setQueuedCommands] = useState<QueuedCommand[]>([]);
  const [connectivity, setConnectivity] = useState<ConnectivityState>(currentConnectivity);

  useEffect(() => setAuthoritative(bootstrap.today), [bootstrap.today]);

  const synchronizer = useMemo(() => {
    const runtime = bootstrap.sync_runtime;
    if (!runtime) return null;
    return new OfflineCommandSynchronizer({
      queue,
      transport: runtime.command_transport,
      projection_loader: runtime.projection_loader,
      participant_id: bootstrap.actor_id,
      expedition_key: bootstrap.today.expedition_id,
      is_online: runtime.is_online,
      now: runtime.now,
      on_queue_changed: setQueuedCommands,
      on_projection: setAuthoritative,
    });
  }, [bootstrap.actor_id, bootstrap.sync_runtime, bootstrap.today.expedition_id]);

  useEffect(() => {
    let active = true;
    void queue.list().then((items) => {
      if (active) setQueuedCommands(items);
    });
    return () => { active = false; };
  }, [authoritative.day.number, authoritative.expedition_id, authoritative.stage.stage_id, bootstrap.actor_id]);

  useEffect(() => {
    const update = () => setConnectivity(currentConnectivity());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    if (synchronizer && connectivity === 'online') void synchronizer.sync();
  }, [connectivity, synchronizer]);

  const data = useMemo(
    () => applyParticipantCommandOverlay(authoritative, queuedCommands, connectivity),
    [authoritative, connectivity, queuedCommands],
  );
  const navigation = useMemo<NavigationItem[]>(() => [
    { id: 'today', label: 'Сегодня', icon: 'cards' },
    { id: 'role', label: 'Роль', icon: 'compass', hidden: !data.product_role },
    { id: 'vote', label: 'Решение', icon: 'check', hidden: !data.decision_vote || data.decision_vote.status === 'none' },
    { id: 'gamification', label: 'XP', icon: 'star', hidden: !bootstrap.gamification },
  ], [bootstrap.gamification, data.decision_vote, data.product_role]);
  const [route, setRoute] = useState(navigation.find((item) => !item.hidden)?.id ?? 'today');
  const context = {
    actor_id: bootstrap.actor_id,
    actor_role: 'participant' as const,
    expedition_id: data.expedition_id,
    day_number: data.day.number,
    stage_id: data.stage.stage_id,
  };
  const dispatch = (command: OfflineQueueableCommand) => {
    void participantDispatcher.dispatch(command).then((result) => {
      setQueuedCommands((items) => upsertQueuedCommand(items, result.queued));
      if (synchronizer && currentConnectivity() === 'online') void synchronizer.sync();
    });
  };
  let content;
  if (route === 'role') content = <ProductRoleDetailScreen data={data} />;
  else if (route === 'vote') content = <ProductDecisionVoteScreen data={data} dispatcher={participantDispatcher} context={context} />;
  else if (route === 'gamification' && bootstrap.gamification) content = <GamificationScreen data={bootstrap.gamification} />;
  else content = <TodayScreen data={data}
    onAcknowledgeCard={(id: string) => dispatch(createAcknowledgeCardCommand(id, context))}
    onStartTask={(id: string) => dispatch(createStartTaskCommand(id, context))}
    onCompleteTask={(id: string) => dispatch(createCompleteTaskCommand(id, context))} />;
  return <AppShell navigation={navigation} activeNavigationId={route} onNavigate={setRoute}>{content}</AppShell>;
}

function CaptainApp({ bootstrap }: { bootstrap: Extract<AppBootstrap, { mode: 'captain' }> }) {
  const data = bootstrap.day;
  const captainDispatcher = useMemo(() => new CommandDispatcher(queue, bootstrap.server_transport), [bootstrap.server_transport]);
  const navigation = useMemo<NavigationItem[]>(() => [
    { id: 'overview', label: 'Обзор', icon: 'cards' },
    { id: 'stage', label: 'Stage', icon: 'route', hidden: !data.controls.advance_stage && !data.controls.override_stage_advance },
    { id: 'recovery', label: 'Recovery', icon: 'calendar', hidden: !data.controls.activate_recovery_day },
  ], [data.controls.activate_recovery_day, data.controls.advance_stage, data.controls.override_stage_advance]);
  const [route, setRoute] = useState('overview');
  const context = {
    actor_id: bootstrap.actor_id,
    actor_role: 'captain' as const,
    expedition_id: data.expedition_id,
    day_number: data.day.number,
    stage_id: data.stage.stage_id,
    day_revision: data.day.revision,
  };
  let content;
  if (route === 'stage') content = <StageControlScreen data={data} stages={stagePathFixture} dispatcher={captainDispatcher} context={context} />;
  else if (route === 'recovery') content = <RecoveryDayScreen data={data} dispatcher={captainDispatcher} context={context} />;
  else content = <DayOverviewScreen data={data} onAction={(action, completionSummary) => {
    if (action === 'advance_stage' || action === 'override_stage_advance') setRoute('stage');
    if (action === 'activate_recovery_day') setRoute('recovery');
    if (action === 'close_expedition') {
      const readiness = data.completion_readiness;
      const summary = completionSummary?.trim();
      if (!readiness.can_close_expedition || !readiness.shore_package_ref || !summary) return;
      const command = createCloseExpeditionCommand({
        shore_package_ref: readiness.shore_package_ref,
        completion_summary: summary,
        expected_projection_version: readiness.expected_projection_version,
      }, context);
      void captainDispatcher.dispatchServer(command);
    }
  }} />;
  return <AppShell variant="captain" navigation={navigation} activeNavigationId={route} onNavigate={setRoute}>{content}</AppShell>;
}

function renderRuntime(bootstrap: AppBootstrap) {
  return bootstrap.mode === 'participant' ? <ParticipantApp bootstrap={bootstrap} /> : <CaptainApp bootstrap={bootstrap} />;
}

export function App() {
  const injectedBootstrap = window.__ILKA_BOOTSTRAP__;
  const previewEnabled = import.meta.env.DEV || import.meta.env.VITE_ILKA_PREVIEW === 'true';
  const previewBootstrap = !injectedBootstrap && previewEnabled
    ? resolvePreviewBootstrap(window.location.search)
    : null;

  if (!injectedBootstrap && previewEnabled && !previewBootstrap) {
    return <><PreviewSwitcher /><AppShell><PreviewLauncher /></AppShell></>;
  }

  const bootstrap = injectedBootstrap ?? previewBootstrap;
  if (!bootstrap) return <AppShell><EmptyState title="Projection bootstrap is missing"
    description="Inject window.__ILKA_BOOTSTRAP__ from the application composition root. UI does not invent domain state." /></AppShell>;

  const runtime = renderRuntime(bootstrap);
  return !injectedBootstrap && previewEnabled ? <><PreviewSwitcher />{runtime}</> : runtime;
}

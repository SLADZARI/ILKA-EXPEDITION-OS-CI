import { useMemo, useState } from 'react';
import type { AppBootstrap } from '../application/projections/bootstrap';
import { participantPreviewBootstrap } from '../dev/preview-bootstrap';
import { AppShell } from '../layout/AppShell';
import type { NavigationItem } from '../navigation/BottomNavigation';
import { LocalStorageCommandQueue } from '../application/offline/OfflineCommandQueue';
import { CommandDispatcher } from '../application/commands/CommandDispatcher';
import { createAcknowledgeCardCommand, createCompleteTaskCommand, createStartTaskCommand } from '../application/commands/task';
import { createCloseExpeditionCommand } from '../application/commands/closeExpedition';
import type { OfflineQueueableCommand } from '../application/offline/OfflineCommandQueue';
import { TodayScreen } from '../screens/participant/TodayScreen';
import { ProductRoleDetailScreen } from '../screens/participant/ProductRoleDetailScreen';
import { ProductDecisionVoteScreen } from '../screens/participant/ProductDecisionVoteScreen';
import { GamificationScreen } from '../screens/participant/GamificationScreen';
import { DayOverviewScreen } from '../screens/captain/DayOverviewScreen';
import { StageControlScreen } from '../screens/captain/StageControlScreen';
import { RecoveryDayScreen } from '../screens/captain/RecoveryDayScreen';
import { stagePathFixture } from '../dev/stage-path.fixture';
import { EmptyState } from '../components/system/EmptyState';

const queue = new LocalStorageCommandQueue();
const participantDispatcher = new CommandDispatcher(queue);

function ParticipantApp({ bootstrap }: { bootstrap: Extract<AppBootstrap, { mode: 'participant' }> }) {
  const data = bootstrap.today;
  const navigation = useMemo<NavigationItem[]>(() => [
    { id: 'today', label: 'Сегодня', icon: 'cards' },
    { id: 'role', label: 'Роль', icon: 'compass', hidden: !data.product_role },
    { id: 'vote', label: 'Решение', icon: 'check', hidden: !data.decision_vote || data.decision_vote.status === 'none' },
    { id: 'gamification', label: 'XP', icon: 'star', hidden: !bootstrap.gamification },
  ], [bootstrap.gamification, data.decision_vote, data.product_role]);
  const [route, setRoute] = useState(navigation.find((item) => !item.hidden)?.id ?? 'today');
  const context = { actor_id: bootstrap.actor_id, actor_role: 'participant' as const, expedition_id: data.expedition_id,
    day_number: data.day.number, stage_id: data.stage.stage_id };
  const dispatch = (command: OfflineQueueableCommand) => { void participantDispatcher.dispatch(command); };
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
  const context = { actor_id: bootstrap.actor_id, actor_role: 'captain' as const, expedition_id: data.expedition_id,
    day_number: data.day.number, stage_id: data.stage.stage_id, day_revision: data.day.revision };
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

export function App() {
  const bootstrap = window.__ILKA_BOOTSTRAP__ ?? (import.meta.env.DEV ? participantPreviewBootstrap : undefined);
  if (!bootstrap) return <AppShell><EmptyState title="Projection bootstrap is missing"
    description="Inject window.__ILKA_BOOTSTRAP__ from the application composition root. UI does not invent domain state." /></AppShell>;
  return bootstrap.mode === 'participant' ? <ParticipantApp bootstrap={bootstrap} /> : <CaptainApp bootstrap={bootstrap} />;
}

import type { TodayView } from './generated/today-view';

export type SyncState = TodayView['sync_status'];
export type Assignment = NonNullable<TodayView['product_role']>;
export type AssignmentState = NonNullable<Assignment['state']>;
export type Task = TodayView['tasks'][number];
export type TaskStatus = Task['status'];
export type Output = TodayView['outputs'][number];
export type StatusTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'critical'
  | 'info'
  | 'offline'
  | 'sync_pending';

export const SYNC_STATE_LABEL: Record<SyncState, string> = {
  synced: 'Synced',
  pending: 'Pending sync',
  conflict: 'Conflict',
  rejected: 'Rejected',
  offline: 'Offline',
};

export const SYNC_STATE_TONE: Record<SyncState, StatusTone> = {
  synced: 'success',
  pending: 'sync_pending',
  conflict: 'warning',
  rejected: 'critical',
  offline: 'offline',
};

export const ASSIGNMENT_STATE_LABEL: Record<AssignmentState, string> = {
  scheduled: 'Scheduled',
  active: 'Active',
  expired: 'Expired',
  overridden: 'Overridden',
  expired_pending_sync: 'Expired · pending sync',
};

export const ASSIGNMENT_STATE_TONE: Record<AssignmentState, StatusTone> = {
  scheduled: 'neutral',
  active: 'success',
  expired: 'neutral',
  overridden: 'warning',
  expired_pending_sync: 'sync_pending',
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  available: 'Available',
  in_progress: 'In progress',
  blocked: 'Blocked',
  completed: 'Completed',
  overdue: 'Overdue',
  completed_late: 'Completed late',
  waived: 'Waived',
};

export const TASK_STATUS_TONE: Record<TaskStatus, StatusTone> = {
  available: 'neutral',
  in_progress: 'info',
  blocked: 'critical',
  completed: 'success',
  overdue: 'warning',
  completed_late: 'warning',
  waived: 'neutral',
};

export type GamificationView = import('./generated/gamification-view').GamificationView;
export type GamificationSyncState = GamificationView['sync_state'];
export type RoleMastery = GamificationView['role_mastery'][number];
export type ContributionRating = GamificationView['contribution'];

export const GAMIFICATION_SYNC_LABEL: Record<GamificationSyncState, string> = {
  provisional: 'Provisional',
  synced: 'Synced',
  conflict: 'Conflict',
  rejected: 'Rejected',
};

export const GAMIFICATION_SYNC_TONE: Record<GamificationSyncState, StatusTone> = {
  provisional: 'sync_pending',
  synced: 'success',
  conflict: 'warning',
  rejected: 'critical',
};

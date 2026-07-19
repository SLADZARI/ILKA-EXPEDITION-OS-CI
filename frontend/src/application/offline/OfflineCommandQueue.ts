import type { Command } from '../../contracts/generated/command';
import { OFFLINE_COMMAND_TYPES, type OfflineCommandType } from '../../contracts/generated/offline-command';

export type QueueStatus = 'pending' | 'synced' | 'conflict' | 'rejected';
export type OfflineQueueableCommand = Extract<Command, { command_type: OfflineCommandType }>;

const offlineTypeSet = new Set<string>(OFFLINE_COMMAND_TYPES);
export function isOfflineQueueableCommand(command: Command): command is OfflineQueueableCommand {
  return offlineTypeSet.has(command.command_type);
}

export type QueuedCommand = {
  local_id: string;
  command: OfflineQueueableCommand;
  status: QueueStatus;
  attempts: number;
  created_at: string;
  last_error?: { code: string; message: string; retryable: boolean } | null;
};

export interface OfflineCommandQueue {
  enqueue(command: OfflineQueueableCommand): Promise<QueuedCommand>;
  list(): Promise<QueuedCommand[]>;
  update(localId: string, patch: Partial<QueuedCommand>): Promise<void>;
}

const STORAGE_KEY = 'ilka.offline-command-queue.v2';

export class LocalStorageCommandQueue implements OfflineCommandQueue {
  private memory: QueuedCommand[] = [];

  private storage(): Storage | null {
    try {
      const candidate = globalThis.localStorage;
      const probe = '__ilka_storage_probe__';
      candidate.setItem(probe, '1');
      candidate.removeItem(probe);
      return candidate;
    } catch { return null; }
  }

  private read(): QueuedCommand[] {
    const storage = this.storage();
    if (!storage) return [...this.memory];
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as QueuedCommand[];
      return parsed.filter((item) => isOfflineQueueableCommand(item.command));
    } catch { return []; }
  }

  private write(items: QueuedCommand[]): void {
    this.memory = [...items];
    const storage = this.storage();
    if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  async enqueue(command: OfflineQueueableCommand): Promise<QueuedCommand>;
  async enqueue(command: Command): Promise<QueuedCommand> {
    if (!isOfflineQueueableCommand(command)) {
      throw new Error(`Command ${command.command_type} is not offline queueable`);
    }
    const item: QueuedCommand = {
      local_id: `local_${command.command_id}`,
      command, status: 'pending', attempts: 0,
      created_at: new Date().toISOString(), last_error: null,
    };
    const items = this.read();
    const existing = items.find((entry) => entry.command.command_id === command.command_id);
    if (existing) return existing;
    items.push(item); this.write(items); return item;
  }
  async list(): Promise<QueuedCommand[]> { return this.read(); }
  async update(localId: string, patch: Partial<QueuedCommand>): Promise<void> {
    this.write(this.read().map((item) => item.local_id === localId ? { ...item, ...patch } : item));
  }
}

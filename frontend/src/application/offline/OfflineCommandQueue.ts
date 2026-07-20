import type { Command } from '../../contracts/generated/command';
import { OFFLINE_COMMAND_TYPES, type OfflineCommandType } from '../../contracts/generated/offline-command';

export type QueueStatus = 'pending' | 'synced' | 'conflict' | 'rejected';
export type OfflineQueueableCommand = Extract<Command, { command_type: OfflineCommandType }>;

const offlineTypeSet = new Set<string>(OFFLINE_COMMAND_TYPES);
export function isOfflineQueueableCommand(command: Command): command is OfflineQueueableCommand {
  return offlineTypeSet.has(command.command_type);
}

export type QueueError = { code: string; message: string; retryable: boolean };

export type QueuedCommand = {
  local_id: string;
  command: OfflineQueueableCommand;
  status: QueueStatus;
  attempts: number;
  created_at: string;
  last_error?: QueueError | null;
};

export type QueuePatch = Partial<Pick<QueuedCommand, 'status' | 'attempts' | 'last_error'>>;

export interface OfflineCommandQueue {
  enqueue(command: OfflineQueueableCommand): Promise<QueuedCommand>;
  list(): Promise<QueuedCommand[]>;
  update(localId: string, patch: QueuePatch): Promise<void>;
}

function createQueuedCommand(command: OfflineQueueableCommand, createdAt: string): QueuedCommand {
  return {
    local_id: `local_${command.command_id}`,
    command,
    status: 'pending',
    attempts: 0,
    created_at: createdAt,
    last_error: null,
  };
}

function isQueuedCommand(value: unknown): value is QueuedCommand {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<QueuedCommand>;
  return typeof candidate.local_id === 'string'
    && typeof candidate.created_at === 'string'
    && typeof candidate.attempts === 'number'
    && ['pending', 'synced', 'conflict', 'rejected'].includes(candidate.status ?? '')
    && Boolean(candidate.command)
    && isOfflineQueueableCommand(candidate.command as Command);
}

export class MemoryCommandQueue implements OfflineCommandQueue {
  private items = new Map<string, QueuedCommand>();

  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  async enqueue(command: OfflineQueueableCommand): Promise<QueuedCommand>;
  async enqueue(command: Command): Promise<QueuedCommand> {
    if (!isOfflineQueueableCommand(command)) {
      throw new Error(`Command ${command.command_type} is not offline queueable`);
    }
    const localId = `local_${command.command_id}`;
    const existing = this.items.get(localId);
    if (existing) return existing;
    const item = createQueuedCommand(command, this.now());
    this.items.set(localId, item);
    return item;
  }

  async list(): Promise<QueuedCommand[]> {
    return [...this.items.values()].sort((left, right) => left.created_at.localeCompare(right.created_at));
  }

  async update(localId: string, patch: QueuePatch): Promise<void> {
    const existing = this.items.get(localId);
    if (!existing) return;
    this.items.set(localId, { ...existing, ...patch, local_id: existing.local_id, command: existing.command });
  }
}

type IndexedDbCommandQueueOptions = {
  databaseName?: string;
  storeName?: string;
  indexedDBFactory?: IDBFactory | null;
  fallback?: OfflineCommandQueue;
  now?: () => string;
};

function defaultIndexedDbFactory(): IDBFactory | null {
  try {
    return globalThis.indexedDB ?? null;
  } catch {
    return null;
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export class IndexedDbCommandQueue implements OfflineCommandQueue {
  private readonly databaseName: string;
  private readonly storeName: string;
  private readonly factory: IDBFactory | null;
  private readonly fallback: OfflineCommandQueue;
  private readonly now: () => string;
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(options: IndexedDbCommandQueueOptions = {}) {
    this.databaseName = options.databaseName ?? 'ilka-expedition-os';
    this.storeName = options.storeName ?? 'offline_command_queue_v2';
    this.factory = options.indexedDBFactory === undefined ? defaultIndexedDbFactory() : options.indexedDBFactory;
    this.now = options.now ?? (() => new Date().toISOString());
    this.fallback = options.fallback ?? new MemoryCommandQueue(this.now);
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (!this.factory) return Promise.reject(new Error('IndexedDB is unavailable'));
    if (this.databasePromise) return this.databasePromise;

    this.databasePromise = new Promise((resolve, reject) => {
      const request = this.factory!.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(this.storeName)) {
          database.createObjectStore(this.storeName, { keyPath: 'local_id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB'));
      request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked'));
    }).catch((error) => {
      this.databasePromise = null;
      throw error;
    });

    return this.databasePromise;
  }

  private async withFallback<T>(
    operation: (database: IDBDatabase) => Promise<T>,
    fallback: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation(await this.openDatabase());
    } catch {
      return fallback();
    }
  }

  async enqueue(command: OfflineQueueableCommand): Promise<QueuedCommand>;
  async enqueue(command: Command): Promise<QueuedCommand> {
    if (!isOfflineQueueableCommand(command)) {
      throw new Error(`Command ${command.command_type} is not offline queueable`);
    }

    return this.withFallback(async (database) => {
      const item = createQueuedCommand(command, this.now());
      const transaction = database.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const existing = await requestResult<QueuedCommand | undefined>(store.get(item.local_id));
      if (existing && isQueuedCommand(existing)) {
        await transactionComplete(transaction);
        return existing;
      }
      store.put(item);
      await transactionComplete(transaction);
      return item;
    }, () => this.fallback.enqueue(command));
  }

  async list(): Promise<QueuedCommand[]> {
    return this.withFallback(async (database) => {
      const transaction = database.transaction(this.storeName, 'readonly');
      const items = await requestResult<QueuedCommand[]>(transaction.objectStore(this.storeName).getAll());
      await transactionComplete(transaction);
      return items.filter(isQueuedCommand)
        .sort((left, right) => left.created_at.localeCompare(right.created_at));
    }, () => this.fallback.list());
  }

  async update(localId: string, patch: QueuePatch): Promise<void> {
    return this.withFallback(async (database) => {
      const transaction = database.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const existing = await requestResult<QueuedCommand | undefined>(store.get(localId));
      if (existing && isQueuedCommand(existing)) {
        store.put({ ...existing, ...patch, local_id: existing.local_id, command: existing.command });
      }
      await transactionComplete(transaction);
    }, () => this.fallback.update(localId, patch));
  }
}

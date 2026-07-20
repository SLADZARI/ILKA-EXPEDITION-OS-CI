export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ActorRole =
  | "captain"
  | "product_captain"
  | "participant"
  | "shore_operator"
  | "system"
  | "system_clock";

export interface CommandEnvelope {
  command_id: string;
  command_type: string;
  issued_at: string;
  actor_id: string;
  actor_role: ActorRole;
  expedition_id: string;
  idempotency_key: string;
  payload: Record<string, JsonValue>;
  day_number?: number | null;
  stage_id?: string | null;
  device_id?: string | null;
  day_revision?: number | null;
}

export interface AuthUser {
  id: string;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface RuntimeRelease {
  id: string;
  release_key: string;
  git_commit_sha: string;
  rules_release: string;
  content_release: string;
  reducer_version: string;
}

export interface ProjectionDocument {
  projection_key: string;
  projection_type: string;
  subject_id: string | null;
  schema_id: string;
  schema_version: string;
  projection: Record<string, JsonValue>;
  projection_version: number;
  source_stream_position: number;
}

export interface ActorContext {
  auth_user_id: string;
  profile_id: string;
  membership_id: string;
  participant_id: string | null;
  participant_key: string | null;
  membership_role: "captain" | "participant" | "shore_operator";
}

export interface GatewayExecutionContext {
  expedition_id: string;
  expedition_key: string;
  expedition_status: string;
  stream_position: number;
  projection_version: number;
  runtime_release: RuntimeRelease;
  actor: ActorContext | null;
  projections: ProjectionDocument[];
}

export interface PreparedProjectionMutation {
  operation: "upsert";
  projection_key: string;
  projection_type: string;
  subject_id: string | null;
  schema_id: string;
  schema_version: string;
  projection: Record<string, JsonValue>;
}

export interface PreparedCommandResult {
  status: "accepted" | "rejected";
  events: Array<Record<string, JsonValue>>;
  projection_mutations: PreparedProjectionMutation[];
  rejection: { code: string; message: string | null } | null;
}

export interface RuntimeInput {
  command: CommandEnvelope;
  actor_role: ActorRole;
  actor_id: string;
  context: GatewayExecutionContext;
  received_at: string;
}

export interface RuntimeBundle {
  readonly release_key: string;
  readonly git_commit_sha: string;
  readonly rules_release: string;
  readonly content_release: string;
  readonly reducer_version: string;
  resolveActorRole(input: RuntimeInput): Promise<ActorRole>;
  reduce(input: RuntimeInput): Promise<PreparedCommandResult>;
}

export interface PersistedReceipt {
  command_id: string;
  expedition_id: string;
  expedition_key: string;
  command_type: string;
  actor_auth_user_id: string | null;
  actor_profile_id: string | null;
  actor_membership_id: string | null;
  actor_participant_id: string | null;
  actor_role: string;
  request_hash: string;
  status: "accepted" | "rejected" | "conflict";
  received_at: string;
  processed_at: string;
  event_ids: string[];
  stream_position: number;
  projection_version: number;
  runtime_release_id: string;
  reducer_version: string;
  rejection_code: string | null;
  rejection_message: string | null;
  conflict_code: string | null;
}

export interface ProcessCommandResult {
  outcome: "accepted" | "rejected" | "conflict";
  replayed: boolean;
  persisted: boolean;
  receipt: PersistedReceipt;
  projection_updates: Array<{
    projection_key: string;
    projection_version: number;
    source_stream_position: number;
  }>;
  expected_stream_position: number;
  current_stream_position: number;
}

export interface ExistingReceiptLookup {
  expedition_key: string;
  request_hash: string;
  result: ProcessCommandResult;
}

export interface GatewayDatabase {
  getReceipt(commandId: string): Promise<ExistingReceiptLookup | null>;
  loadContext(
    expeditionKey: string,
    authUserId: string,
  ): Promise<GatewayExecutionContext | null>;
  processCommand(request: Record<string, JsonValue>): Promise<ProcessCommandResult>;
}

export interface AuthVerifier {
  verify(authorizationHeader: string): Promise<AuthUser | null>;
}

export interface SchemaValidator {
  validateCommand(value: unknown): ValidationIssue[];
  validatePreparedEvent(value: unknown): ValidationIssue[];
  validateProcessRequest(value: unknown): ValidationIssue[];
  validateProcessResult(value: unknown): ValidationIssue[];
}

export interface RuntimeRegistry {
  find(release: RuntimeRelease): RuntimeBundle | null;
}

export interface GatewayDependencies {
  auth: AuthVerifier;
  database: GatewayDatabase;
  schemas: SchemaValidator;
  runtimes: RuntimeRegistry;
  allowedOrigins: ReadonlySet<string>;
  now(): Date;
  requestId(): string;
}

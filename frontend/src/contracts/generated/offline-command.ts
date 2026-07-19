/* GENERATED from app/contracts/offline-command.schema.json. Do not edit. */
export const OFFLINE_COMMAND_TYPES = ["acknowledge_card","start_task","block_task","complete_task","confirm_output","request_day_close","request_stage_advance","create_decision_draft","create_vote","vote"] as const;
export type OfflineCommandType = typeof OFFLINE_COMMAND_TYPES[number];
export type OfflineCommand = {
  "local_id": string;
  "command_id": string;
  "command_type": "acknowledge_card" | "start_task" | "block_task" | "complete_task" | "confirm_output" | "request_day_close" | "request_stage_advance" | "create_decision_draft" | "create_vote" | "vote";
  "expedition_id": string;
  "actor_id": string;
  "actor_role": "captain" | "product_captain" | "participant" | "shore_operator" | "system" | "system_clock";
  "created_at": string;
  "base_version"?: number | null;
  "payload": {

  };
  "status": "pending" | "synced" | "conflict" | "rejected";
  "attempts": number;
  "last_error"?: {
    "code": string;
    "message": string;
    "retryable": boolean;
  } | null;
  "day_revision"?: number | null;
};

/* GENERATED from app/contracts/today-view.schema.json. Do not edit. */
export type TodayView = {
  "expedition_id": string;
  "participant_id": string;
  "local_date": string;
  "day": {
    "number": number;
    "status": "not_started" | "active" | "review" | "closed" | "transition_failed";
    "boundary_sync_state"?: "authoritative" | "expired_pending_sync" | "awaiting_bundle_sync";
  };
  "stage": {
    "stage_id": string;
    "title": string;
    "status"?: "locked" | "available" | "active" | "completed";
    "next_stage_id"?: string | null;
    "advance_request_status"?: "none" | "pending" | "synced" | "conflict" | "rejected";
    "pending_target_stage_id"?: string | null;
  };
  "product_role"?: {
    "assignment_id"?: string;
    "role_id"?: string;
    "title"?: string;
    "state"?: "scheduled" | "active" | "expired" | "overridden" | "expired_pending_sync";
  } | null;
  "onboard_role"?: {
    "assignment_id"?: string;
    "role_id"?: string;
    "title"?: string;
    "state"?: "scheduled" | "active" | "expired" | "overridden" | "expired_pending_sync";
  } | null;
  "cards": Array<{
    "card_id": string;
    "title": string;
    "required": boolean;
    "acknowledged": boolean;
    "pending_sync"?: boolean;
  }>;
  "tasks": Array<{
    "task_id": string;
    "title": string;
    "status": "available" | "in_progress" | "blocked" | "completed" | "overdue" | "completed_late" | "waived";
    "due_day_number"?: number;
    "pending_sync"?: boolean;
  }>;
  "sync_status": "synced" | "pending" | "conflict" | "rejected" | "offline";
  "outputs": Array<{
    "output_id": string;
    "title": string;
    "required": boolean;
    "confirmed": boolean;
    "pending_sync"?: boolean;
  }>;
  "decision_vote"?: {
    "status": "none" | "pending_sync" | "open" | "closed" | "finalized" | "overridden";
    "eligible": boolean;
    "vote_id"?: string | null;
    "decision_id"?: string | null;
    "round_version"?: number | null;
    "options"?: Array<{
      "option_id": string;
      "title": string;
    }>;
    "my_choice"?: string | null;
    "my_ballot_revision"?: number | null;
    "pending_sync"?: boolean;
  } | null;
  "gamification"?: {
    "rules_version": number;
    "xp_state": "provisional" | "synced" | "conflict" | "rejected";
    "role_mastery": Array<{
      "role_id": string;
      "xp": number;
      "level": "observer" | "crew" | "practiced" | "lead" | "mentor";
      "next_level_xp"?: number | null;
    }>;
    "contribution": {
      "score": number;
      "rank": number | null;
      "status": "active" | "inactive" | "not_enough_data";
      "snapshot_at": string;
    };
  } | null;
  "expedition_status": "draft" | "ready" | "active" | "suspended" | "completed" | "cancelled";
  "expedition_completion": {
    "completed_at": string;
    "final_stage_id": "demo_day";
    "final_day_number": 12;
    "shore_package_ref": string;
    "completion_summary": string;
    "final_projection_version": number;
  } | null;
};

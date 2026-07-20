/* GENERATED from app/contracts/captain-day-view.schema.json. Do not edit. */
export type CaptainDayView = {
  "expedition_id": string;
  "local_date": string;
  "day": {
    "number": number;
    "stage_id": string;
    "status": "not_started" | "active" | "review" | "closed" | "transition_failed";
    "boundary_at"?: string;
    "revision"?: number;
    "superseded_day_numbers"?: Array<number>;
    "transition_mode"?: "automatic" | "forced" | "rewound";
  };
  "participants": Array<{
    "participant_id": string;
    "product_role_id": string;
    "onboard_role_id": string;
    "required_cards_acknowledged": boolean;
    "required_tasks_terminal": boolean;
    "overdue_task_count"?: number;
    "sync_status"?: "synced" | "pending" | "conflict" | "rejected" | "offline";
    "status"?: "active" | "banned";
    "access_revoked"?: boolean;
  }>;
  "blockers": Array<{
    "code": string;
    "message": string;
    "entity_id": string;
  }>;
  "can_close_day": boolean;
  "controls": {
    "override_day_close": boolean;
    "recover_day_transition": boolean;
    "activate_recovery_day": boolean;
    "override_role_assignment": boolean;
    "normal_start_day"?: false;
    "request_stage_advance": boolean;
    "advance_stage": boolean;
    "override_stage_advance": boolean;
    "force_day_transition"?: boolean;
    "rewind_day"?: boolean;
    "ban_participant"?: boolean;
    "unban_participant"?: boolean;
    "create_decision_draft"?: boolean;
    "create_vote"?: boolean;
    "finalize_product_decision"?: boolean;
    "override_product_decision"?: boolean;
    "close_expedition": boolean;
  };
  "sync_status": "synced" | "pending" | "conflict" | "rejected" | "offline";
  "outputs": Array<{
    "output_id": string;
    "required": boolean;
    "confirmed": boolean;
    "evidence_refs": Array<string>;
    "confirmed_by"?: string | null;
    "pending_sync"?: boolean;
  }>;
  "stage": {
    "stage_id": string;
    "status": "locked" | "available" | "active" | "completed";
    "next_stage_id": string | null;
    "advance_request_status": "none" | "pending" | "synced" | "conflict" | "rejected";
    "requested_by"?: string | null;
    "can_advance": boolean;
    "advance_blockers"?: Array<{
      "code": string;
      "message": string;
    }>;
  };
  "super_admin"?: {
    "enabled": true;
    "scope": "expedition";
    "server_confirmation_required": true;
    "can_delete_events"?: false;
    "can_impersonate_system_clock"?: false;
  };
  "decision"?: {
    "status": "none" | "draft" | "vote_open" | "finalized" | "overridden";
    "decision_id"?: string | null;
    "vote_id"?: string | null;
    "round_version"?: number | null;
    "eligible_voter_ids"?: Array<string>;
    "effective_ballot_count"?: number;
    "abstention_count"?: number;
    "selected_option_id"?: string | null;
    "can_finalize"?: boolean;
    "blockers"?: Array<{
      "code": string;
      "message": string;
    }>;
  } | null;
  "gamification_summary"?: {
    "rules_version": number;
    "snapshot_at": string;
    "entries": Array<{
      "participant_id": string;
      "score": number;
      "rank": number | null;
      "status": "active" | "inactive" | "not_enough_data";
    }>;
    "pending_verifications": Array<{
      "assignment_id": string;
      "participant_id": string;
      "role_id": string;
      "role_type": "product" | "onboard";
    }>;
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
  "completion_readiness": {
    "state": "unavailable" | "blocked" | "ready" | "completed";
    "can_close_expedition": boolean;
    "final_stage_id": "demo_day" | null;
    "final_day_number": number | null;
    "shore_package_ref": string | null;
    "expected_projection_version": number;
    "blockers": Array<{
      "code": string;
      "message": string;
      "entity_id"?: string | null;
    }>;
  };
};

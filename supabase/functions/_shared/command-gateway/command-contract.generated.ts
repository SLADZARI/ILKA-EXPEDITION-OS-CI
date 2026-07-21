/* GENERATED from engine/command-catalog.yaml. Do not edit. */
export const COMMAND_CONTRACTS = {
  "accept_invitation": {
    "allowedActors": [
      "participant",
    ],
    "offlineAllowed": false,
  },
  "acknowledge_card": {
    "allowedActors": [
      "participant",
      "product_captain",
      "captain",
    ],
    "offlineAllowed": true,
  },
  "activate_recovery_day": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
  "adjust_role_xp": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
  "advance_stage": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
  "ban_participant": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
  "block_task": {
    "allowedActors": [
      "participant",
      "product_captain",
      "captain",
    ],
    "offlineAllowed": true,
  },
  "close_day": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
  "close_expedition": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
  "complete_task": {
    "allowedActors": [
      "participant",
      "product_captain",
      "captain",
    ],
    "offlineAllowed": true,
  },
  "confirm_output": {
    "allowedActors": [
      "product_captain",
      "captain",
    ],
    "offlineAllowed": true,
  },
  "create_decision_draft": {
    "allowedActors": [
      "product_captain",
      "captain",
    ],
    "offlineAllowed": true,
  },
  "create_expedition": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
  "create_vote": {
    "allowedActors": [
      "product_captain",
      "captain",
    ],
    "offlineAllowed": true,
  },
  "finalize_product_decision": {
    "allowedActors": [
      "product_captain",
      "captain",
    ],
    "offlineAllowed": false,
  },
  "force_day_transition": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
  "generate_rotation": {
    "allowedActors": [
      "captain",
      "system",
    ],
    "offlineAllowed": false,
  },
  "invite_participant": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
  "override_day_close": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
  "override_product_decision": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
  "override_role_assignment": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
  "override_stage_advance": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
  "process_day_boundary": {
    "allowedActors": [
      "system_clock",
    ],
    "offlineAllowed": false,
  },
  "publish_rating_snapshot": {
    "allowedActors": [
      "system",
    ],
    "offlineAllowed": false,
  },
  "recover_day_transition": {
    "allowedActors": [
      "captain",
      "system",
    ],
    "offlineAllowed": false,
  },
  "request_day_close": {
    "allowedActors": [
      "product_captain",
      "captain",
    ],
    "offlineAllowed": true,
  },
  "request_stage_advance": {
    "allowedActors": [
      "product_captain",
      "captain",
    ],
    "offlineAllowed": true,
  },
  "resume_program": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
  "revoke_invitation": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
  "rewind_day": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
  "start_evening_session": {
    "allowedActors": [
      "captain",
      "product_captain",
    ],
    "offlineAllowed": false,
  },
  "start_expedition": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
  "start_task": {
    "allowedActors": [
      "participant",
      "product_captain",
      "captain",
    ],
    "offlineAllowed": true,
  },
  "suspend_program": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
  "unban_participant": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
  "verify_role_assignment": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
  "vote": {
    "allowedActors": [
      "participant",
      "product_captain",
      "captain",
    ],
    "offlineAllowed": true,
  },
  "waive_task": {
    "allowedActors": [
      "captain",
    ],
    "offlineAllowed": false,
  },
} as const;

export type GatewayCommandType = keyof typeof COMMAND_CONTRACTS;
export type GatewayActorRole =
  (typeof COMMAND_CONTRACTS)[GatewayCommandType]["allowedActors"][number];

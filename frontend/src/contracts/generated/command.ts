/* GENERATED from schemas/command.schema.json. Do not edit. */
export type CommandType = "create_expedition" | "add_participant" | "ban_participant" | "unban_participant" | "generate_rotation" | "start_expedition" | "request_stage_advance" | "advance_stage" | "override_stage_advance" | "process_day_boundary" | "recover_day_transition" | "force_day_transition" | "rewind_day" | "start_evening_session" | "acknowledge_card" | "start_task" | "block_task" | "complete_task" | "waive_task" | "confirm_output" | "request_day_close" | "close_day" | "close_expedition" | "override_day_close" | "override_role_assignment" | "activate_recovery_day" | "suspend_program" | "resume_program" | "create_decision_draft" | "create_vote" | "vote" | "finalize_product_decision" | "override_product_decision" | "verify_role_assignment" | "adjust_role_xp" | "publish_rating_snapshot";
export type ActorRole = "captain" | "product_captain" | "participant" | "shore_operator" | "system" | "system_clock";
export type CommandEnvelopeBase = {
  "command_id": string;
  "issued_at": string;
  "actor_id": string;
  "actor_role": "captain" | "product_captain" | "participant" | "shore_operator" | "system" | "system_clock";
  "expedition_id": string;
  "idempotency_key": string;
  "day_number"?: number | null;
  "stage_id"?: string | null;
  "device_id"?: string | null;
  "day_revision"?: number | null;
};

export type create_expeditionPayload = { "name": string; "timezone": string; "duration_days": number; "day_boundary_local_time": string; [key: string]: unknown; };
export type add_participantPayload = { "participant_id": string; "display_name": string; [key: string]: unknown; };
export type ban_participantPayload = { "participant_id": string; "reason": string; "effective_at": string; [key: string]: unknown; };
export type unban_participantPayload = { "participant_id": string; "reason": string; "effective_at": string; [key: string]: unknown; };
export type generate_rotationPayload = { "seed": string | number; "rules_version": number | string; [key: string]: unknown; };
export type start_expeditionPayload = { [key: string]: unknown; };
export type request_stage_advancePayload = { "from_stage_id": string; "to_stage_id": string; "requested_for_day_number": number; [key: string]: unknown; };
export type advance_stagePayload = { "from_stage_id": string; "to_stage_id": string; "effective_from_day_number": number; "request_event_id"?: string | null; [key: string]: unknown; };
export type override_stage_advancePayload = { "from_stage_id": string; "to_stage_id": string; "effective_from_day_number": number; "reason": string; "unmet_conditions": Array<string>; [key: string]: unknown; };
export type process_day_boundaryPayload = { "local_calendar_date": string; "boundary_at": string; [key: string]: unknown; };
export type recover_day_transitionPayload = { "local_calendar_date": string; "reason": string; [key: string]: unknown; };
export type force_day_transitionPayload = { "target_local_calendar_date": string; "reason": string; "expected_projection_version": number; [key: string]: unknown; };
export type rewind_dayPayload = { "from_day_number": number; "to_day_number": number; "reason": string; "expected_projection_version": number; [key: string]: unknown; };
export type start_evening_sessionPayload = { "day_number": number; "stage_id": string; [key: string]: unknown; };
export type acknowledge_cardPayload = { "card_id": string; [key: string]: unknown; };
export type start_taskPayload = { "task_id": string; [key: string]: unknown; };
export type block_taskPayload = { "task_id": string; "reason": string; [key: string]: unknown; };
export type complete_taskPayload = { "task_id": string; [key: string]: unknown; };
export type waive_taskPayload = { "task_id": string; "reason": string; [key: string]: unknown; };
export type confirm_outputPayload = { "stage_id": string; "output_id": string; "evidence_refs": Array<string>; [key: string]: unknown; };
export type request_day_closePayload = { "day_number": number; [key: string]: unknown; };
export type close_dayPayload = { "day_number": number; [key: string]: unknown; };
export type close_expeditionPayload = { "final_stage_id": "demo_day"; "final_day_number": 12; "shore_package_ref": string; "completion_summary": string; "expected_projection_version": number; [key: string]: unknown; };
export type override_day_closePayload = { "day_number": number; "reason": string; "unmet_conditions": Array<string>; [key: string]: unknown; };
export type override_role_assignmentPayload = { "participant_id": string; "role_type": "product" | "onboard"; "previous_role_id": string; "new_role_id": string; "reason": string; [key: string]: unknown; };
export type activate_recovery_dayPayload = { "local_calendar_date": string; "reason": string; [key: string]: unknown; };
export type suspend_programPayload = { "reason": string; [key: string]: unknown; };
export type resume_programPayload = { [key: string]: unknown; };
export type create_decision_draftPayload = { "decision_id": string; "stage_id": "product_decision"; "question": string; "options": Array<{ "option_id": string; "title": string; "summary"?: string; }>; "criteria": Array<string>; "evidence_refs": Array<string>; [key: string]: unknown; };
export type create_votePayload = { "vote_id": string; "decision_id": string; "eligible_voter_ids": Array<string>; "vote_mode": "single_choice"; "quorum_rule": "all_eligible"; "threshold_rule": "strict_majority_of_eligible"; "round_version": number; [key: string]: unknown; };
export type votePayload = { "vote_id": string; "choice": string; "ballot_revision": number; "reason"?: string; [key: string]: unknown; };
export type finalize_product_decisionPayload = { "vote_id": string; "decision_id": string; "selected_option_id": string; "rationale": string; "rejected_option_ids": Array<string>; "objection_summary": Array<string>; "evidence_refs": Array<string>; "expected_round_version": number; [key: string]: unknown; };
export type override_product_decisionPayload = { "vote_id": string; "decision_id": string; "selected_option_id": string; "reason": string; "unresolved_objections": Array<string>; "evidence_refs": Array<string>; "expected_round_version": number; [key: string]: unknown; };
export type verify_role_assignmentPayload = { "assignment_id": string; "participant_id": string; "role_id": string; "role_type": "product" | "onboard"; "outcome": "completed" | "partial" | "waived"; "evidence_refs": Array<string>; "expected_assignment_version": number; "reason"?: string; [key: string]: unknown; };
export type adjust_role_xpPayload = { "adjustment_id": string; "participant_id": string; "role_id": string; "delta": number; "reason": string; "evidence_refs": Array<string>; "expected_balance_version": number; "correction_of"?: string; [key: string]: unknown; };
export type publish_rating_snapshotPayload = { "day_number": number; "day_revision": number; "rules_version": number; "projection_version": number; [key: string]: unknown; };

export interface CommandPayloadByType {
  "create_expedition": create_expeditionPayload;
  "add_participant": add_participantPayload;
  "ban_participant": ban_participantPayload;
  "unban_participant": unban_participantPayload;
  "generate_rotation": generate_rotationPayload;
  "start_expedition": start_expeditionPayload;
  "request_stage_advance": request_stage_advancePayload;
  "advance_stage": advance_stagePayload;
  "override_stage_advance": override_stage_advancePayload;
  "process_day_boundary": process_day_boundaryPayload;
  "recover_day_transition": recover_day_transitionPayload;
  "force_day_transition": force_day_transitionPayload;
  "rewind_day": rewind_dayPayload;
  "start_evening_session": start_evening_sessionPayload;
  "acknowledge_card": acknowledge_cardPayload;
  "start_task": start_taskPayload;
  "block_task": block_taskPayload;
  "complete_task": complete_taskPayload;
  "waive_task": waive_taskPayload;
  "confirm_output": confirm_outputPayload;
  "request_day_close": request_day_closePayload;
  "close_day": close_dayPayload;
  "close_expedition": close_expeditionPayload;
  "override_day_close": override_day_closePayload;
  "override_role_assignment": override_role_assignmentPayload;
  "activate_recovery_day": activate_recovery_dayPayload;
  "suspend_program": suspend_programPayload;
  "resume_program": resume_programPayload;
  "create_decision_draft": create_decision_draftPayload;
  "create_vote": create_votePayload;
  "vote": votePayload;
  "finalize_product_decision": finalize_product_decisionPayload;
  "override_product_decision": override_product_decisionPayload;
  "verify_role_assignment": verify_role_assignmentPayload;
  "adjust_role_xp": adjust_role_xpPayload;
  "publish_rating_snapshot": publish_rating_snapshotPayload;
}

export type Command = {
  [K in CommandType]: CommandEnvelopeBase & { command_type: K; payload: CommandPayloadByType[K] }
}[CommandType];

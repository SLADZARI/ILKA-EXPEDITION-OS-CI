/* GENERATED from schemas/gamification.schema.json. Do not edit. */
export type GamificationView = {
  "expedition_id": string;
  "participant_id": string;
  "rules_version": number;
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
  "sync_state": "provisional" | "synced" | "conflict" | "rejected";
};

/* GENERATED from engine/pipeline.yaml, engine/role-rotation-rules.yaml,
 * engine/roles-catalog.yaml, stages/01_onboarding.yaml and cards/. Do not edit. */
export const DAY1_PILOT_POLICY = {
  "duration_days": 12,
  "recovery_days_available": 1,
  "team_size_min": 3,
  "team_size_max": 5,
  "invitation_ttl_hours": 168,
  "rotation_rules_version": 2,
  "onboard_role_cycle": [
    "navigation",
    "mooring",
    "order",
    "cook",
    "product_focus",
  ],
  "first_stage_id": "onboarding",
  "product_captain_role": "product_captain",
  "product_support_role": "product_support",
  "cook_role": "cook",
  "day1": {
    "day_number": 1,
    "stage_id": "onboarding",
    "stage_title": "Onboarding and Team Contract",
    "next_stage_id": "problem_discovery",
    "rotation_rules_version": 2,
    "product_role_titles": {
      "product_captain": "Product Captain",
      "product_support": "Product Support",
    },
    "onboard_role_titles": {
      "navigation": "Navigation",
      "mooring": "Mooring",
      "order": "Order",
      "cook": "Cook",
      "product_focus": "Product Focus",
    },
    "shared_cards": [
      {
        "card_id": "knowledge_expedition_rules",
        "type": "knowledge",
        "title": "Правила экспедиции",
        "required": true,
      },
      {
        "card_id": "knowledge_day_01_flow",
        "type": "knowledge",
        "title": "Как проходит Day 1",
        "required": true,
      },
      {
        "card_id": "safety_captain_authority",
        "type": "safety",
        "title": "Приоритет капитана и безопасность",
        "required": true,
      },
      {
        "card_id": "task_team_agreement",
        "type": "task",
        "title": "Сформировать Team Agreement",
        "required": true,
      },
    ],
    "product_role_cards": {
      "product_captain": [
        {
          "card_id": "role_product_captain_day_01",
          "type": "role",
          "title": "Product Captain — Day 1",
          "required": true,
        },
      ],
      "product_support": [
        {
          "card_id": "role_product_support_day_01",
          "type": "role",
          "title": "Product Support — Day 1",
          "required": true,
        },
      ],
    },
    "onboard_role_cards": {
      "navigation": [
        {
          "card_id": "onboard_navigation_day_01",
          "type": "onboard",
          "title": "Navigation — Day 1",
          "required": true,
        },
      ],
      "mooring": [
        {
          "card_id": "onboard_mooring_day_01",
          "type": "onboard",
          "title": "Mooring — Day 1",
          "required": true,
        },
      ],
      "order": [
        {
          "card_id": "onboard_order_day_01",
          "type": "onboard",
          "title": "Order — Day 1",
          "required": true,
        },
      ],
      "cook": [
        {
          "card_id": "onboard_cook_day_01",
          "type": "onboard",
          "title": "Cook — Day 1",
          "required": true,
        },
      ],
      "product_focus": [
        {
          "card_id": "onboard_product_focus_day_01",
          "type": "onboard",
          "title": "Product Focus — Day 1",
          "required": true,
        },
      ],
    },
    "required_outputs": [
      {
        "output_id": "team_agreement",
        "title": "Team Agreement",
        "required": true,
      },
      {
        "output_id": "safety_acknowledgements",
        "title": "Safety Acknowledgements",
        "required": true,
      },
      {
        "output_id": "participant_profiles",
        "title": "Participant Profiles",
        "required": true,
      },
    ],
  },
} as const;

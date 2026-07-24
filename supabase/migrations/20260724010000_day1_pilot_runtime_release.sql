begin;

insert into ilka.runtime_releases (
  release_key,
  git_commit_sha,
  rules_release,
  content_release,
  reducer_version
) values (
  'day1_pilot_v1',
  '969d4956a9247aa5f28ba18cc6fe587bd38c20f4',
  'engine_v10_permissions_v8_roles_v2_rotation_v2',
  'ilka_mvp_12_day_v5_onboarding_v3',
  'day1_pilot_v1'
);

commit;

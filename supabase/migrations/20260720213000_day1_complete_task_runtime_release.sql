begin;

insert into ilka.runtime_releases (
  release_key,
  git_commit_sha,
  rules_release,
  content_release,
  reducer_version
) values (
  'day1_complete_task_v1',
  'edbfc911e9bcfddfb87a4adb6b39d21e1a5f2617',
  'engine_v8_permissions_v7_onboarding_v3',
  'day1_content_v1',
  'day1_complete_task_v1'
);

commit;

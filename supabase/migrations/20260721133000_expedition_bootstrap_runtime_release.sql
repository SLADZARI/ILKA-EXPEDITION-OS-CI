begin;

insert into ilka.runtime_releases (
  release_key,
  git_commit_sha,
  rules_release,
  content_release,
  reducer_version
) values (
  'expedition_bootstrap_v1',
  '6175902f32a73a08476111befcb9e9be36e219bf',
  'engine_v8_permissions_v7',
  'ilka_mvp_12_day_v5',
  'expedition_bootstrap_v1'
);

commit;

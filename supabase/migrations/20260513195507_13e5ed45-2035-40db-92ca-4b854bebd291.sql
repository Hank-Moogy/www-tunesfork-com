CREATE OR REPLACE FUNCTION public.get_user_stats(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target_user uuid;
  result jsonb;
  v_total_saves bigint;
  v_total_projects bigint;
  v_total_bytes bigint;
  v_first_save timestamptz;
  v_biggest_save bigint;
  v_collab_projects bigint;
  v_avg_versions numeric;
  v_current_streak int;
  v_longest_streak int;
  v_heatmap jsonb;
  v_top_plugins jsonb;
  v_bpm_hist jsonb;
  v_dow_hist jsonb;
  v_hour_hist jsonb;
  v_avg_tracks numeric;
  v_recent jsonb;
  v_distinct_plugins bigint;
  v_storage_by_project jsonb;
BEGIN
  target_user := COALESCE(p_user_id, auth.uid());
  IF target_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF target_user <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT
    count(*),
    count(distinct project_id),
    coalesce(sum(file_size_bytes), 0),
    min(created_at),
    coalesce(max(file_size_bytes), 0)
  INTO v_total_saves, v_total_projects, v_total_bytes, v_first_save, v_biggest_save
  FROM project_versions
  WHERE uploader_id = target_user;

  SELECT count(distinct pv.project_id) INTO v_collab_projects
  FROM project_versions pv
  JOIN projects p ON p.id = pv.project_id
  WHERE pv.uploader_id = target_user AND p.owner_id <> target_user;

  SELECT coalesce(avg(cnt), 0) INTO v_avg_versions
  FROM (
    SELECT project_id, count(*) AS cnt
    FROM project_versions
    WHERE uploader_id = target_user
    GROUP BY project_id
  ) t;

  WITH days AS (
    SELECT DISTINCT (created_at AT TIME ZONE 'UTC')::date AS d
    FROM project_versions
    WHERE uploader_id = target_user
  ),
  grouped AS (
    SELECT d,
           d - (row_number() OVER (ORDER BY d))::int AS grp
    FROM days
  ),
  runs AS (
    SELECT grp, count(*) AS len, max(d) AS last_day, min(d) AS first_day
    FROM grouped GROUP BY grp
  )
  SELECT
    coalesce(max(len), 0),
    coalesce(
      (SELECT len FROM runs WHERE last_day >= (current_date - 1) ORDER BY last_day DESC LIMIT 1),
      0
    )
  INTO v_longest_streak, v_current_streak
  FROM runs;

  SELECT coalesce(jsonb_agg(jsonb_build_object('d', day, 'c', cnt) ORDER BY day), '[]'::jsonb)
  INTO v_heatmap
  FROM (
    SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*)::int AS cnt
    FROM project_versions
    WHERE uploader_id = target_user
      AND created_at >= now() - interval '365 days'
    GROUP BY day
  ) t;

  SELECT coalesce(jsonb_agg(jsonb_build_object('name', plugin, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
  INTO v_top_plugins
  FROM (
    SELECT plugin, count(*)::int AS cnt
    FROM (
      SELECT jsonb_array_elements_text(plugin_list) AS plugin
      FROM project_versions
      WHERE uploader_id = target_user
        AND plugin_list IS NOT NULL
        AND jsonb_typeof(plugin_list) = 'array'
    ) p
    WHERE plugin IS NOT NULL AND plugin <> ''
    GROUP BY plugin
    ORDER BY cnt DESC
    LIMIT 10
  ) tp;

  SELECT count(DISTINCT plugin) INTO v_distinct_plugins
  FROM (
    SELECT jsonb_array_elements_text(plugin_list) AS plugin
    FROM project_versions
    WHERE uploader_id = target_user
      AND plugin_list IS NOT NULL
      AND jsonb_typeof(plugin_list) = 'array'
  ) p
  WHERE plugin IS NOT NULL AND plugin <> '';

  SELECT coalesce(jsonb_agg(jsonb_build_object('bpm', bpm, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
  INTO v_bpm_hist
  FROM (
    SELECT p.bpm, count(distinct p.id)::int AS cnt
    FROM projects p
    WHERE p.bpm IS NOT NULL
      AND EXISTS (SELECT 1 FROM project_versions pv WHERE pv.project_id = p.id AND pv.uploader_id = target_user)
    GROUP BY p.bpm
    ORDER BY cnt DESC
    LIMIT 8
  ) b;

  SELECT coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'count', cnt) ORDER BY dow), '[]'::jsonb)
  INTO v_dow_hist
  FROM (
    SELECT extract(dow FROM created_at)::int AS dow, count(*)::int AS cnt
    FROM project_versions
    WHERE uploader_id = target_user
    GROUP BY dow
  ) d;

  SELECT coalesce(jsonb_agg(jsonb_build_object('hour', hour, 'count', cnt) ORDER BY hour), '[]'::jsonb)
  INTO v_hour_hist
  FROM (
    SELECT extract(hour FROM created_at)::int AS hour, count(*)::int AS cnt
    FROM project_versions
    WHERE uploader_id = target_user
    GROUP BY hour
  ) h;

  SELECT coalesce(avg(jsonb_array_length(track_list)), 0) INTO v_avg_tracks
  FROM project_versions
  WHERE uploader_id = target_user
    AND track_list IS NOT NULL
    AND jsonb_typeof(track_list) = 'array';

  SELECT coalesce(jsonb_agg(row_to_json(r) ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_recent
  FROM (
    SELECT pv.id, pv.project_id, pv.version_number, pv.created_at, pv.file_size_bytes,
           p.name AS project_name
    FROM project_versions pv
    JOIN projects p ON p.id = pv.project_id
    WHERE pv.uploader_id = target_user
    ORDER BY pv.created_at DESC
    LIMIT 10
  ) r;

  -- Storage breakdown per project (only versions uploaded by this user)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'project_id', project_id,
    'project_name', project_name,
    'bytes', bytes,
    'version_count', version_count
  ) ORDER BY bytes DESC), '[]'::jsonb)
  INTO v_storage_by_project
  FROM (
    SELECT pv.project_id,
           p.name AS project_name,
           sum(pv.file_size_bytes)::bigint AS bytes,
           count(*)::int AS version_count
    FROM project_versions pv
    JOIN projects p ON p.id = pv.project_id
    WHERE pv.uploader_id = target_user
    GROUP BY pv.project_id, p.name
  ) sb;

  result := jsonb_build_object(
    'user_id', target_user,
    'total_saves', v_total_saves,
    'total_projects', v_total_projects,
    'total_bytes', v_total_bytes,
    'biggest_save_bytes', v_biggest_save,
    'first_save', v_first_save,
    'collab_projects', v_collab_projects,
    'avg_versions_per_project', v_avg_versions,
    'current_streak', v_current_streak,
    'longest_streak', v_longest_streak,
    'distinct_plugins', v_distinct_plugins,
    'avg_tracks_per_save', v_avg_tracks,
    'heatmap', v_heatmap,
    'top_plugins', v_top_plugins,
    'bpm_histogram', v_bpm_hist,
    'dow_histogram', v_dow_hist,
    'hour_histogram', v_hour_hist,
    'recent', v_recent,
    'storage_by_project', v_storage_by_project
  );

  RETURN result;
END;
$function$;
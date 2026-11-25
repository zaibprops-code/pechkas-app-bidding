-- =============================================================================
-- Settings, redesigned (the owner, 25 November 2026).
--
-- The page opens with the person on the app's coloured top and one strip of
-- three real numbers. They are worked out here, from the asker's own rows:
--
--   my_settings()      since when they have been with Pechkas; as a customer,
--                      jobs done, jobs still under guarantee and what she has
--                      spent this year (Pakistan's calendar); as a technician,
--                      jobs done, his rating (NULL — "New" — until
--                      rating_min_count, the same rule as pro_rating()) and
--                      what he kept this month after Pechkas' share, and the
--                      trades he may take.
--   my_ratings()       his rating and what customers wrote, newest first:
--                      revealed ratings only, never the writer's name — the
--                      same words offer_profile() shows customers choosing him.
--   set_my_name(name)  a customer correcting her first name. Letters only,
--                      1 to 40, no digits (so never a phone number) and no @.
--                      Technicians' approved full names are not touched: this
--                      changes profiles.first_name only.
--
-- Nothing new is stored. Safe to run twice.
-- =============================================================================

BEGIN;

/** The numbers on the Settings page, for whoever asks, from their own rows. */
CREATE OR REPLACE FUNCTION public.my_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH me AS (SELECT auth.uid() AS id),
  pk AS (SELECT (now() AT TIME ZONE 'Asia/Karachi') AS t)
  SELECT jsonb_build_object(
    'since', (SELECT p.created_at FROM public.profiles p WHERE p.id = me.id),
    'customer', jsonb_build_object(
      'done', (SELECT count(*) FROM public.jobs j WHERE j.customer_id = me.id AND j.status = 'done'),
      'covered', (SELECT count(*) FROM public.jobs j WHERE j.customer_id = me.id AND j.status = 'done'
                    AND j.finished_at + make_interval(days => public.guarantee_days_of(j.id)) > now()),
      'year', (SELECT extract(year FROM pk.t)::integer FROM pk),
      'spent_paisa', (SELECT coalesce(sum(j.collect_paisa), 0) FROM public.jobs j, pk
                      WHERE j.customer_id = me.id AND j.status IN ('done', 'stopped') AND NOT j.paid_by_pechkas
                        AND extract(year FROM (j.finished_at AT TIME ZONE 'Asia/Karachi')) = extract(year FROM pk.t))
    ),
    'pro', (SELECT jsonb_build_object(
      'jobs_done', (public.pro_rating(r.id) ->> 'jobs_done')::integer,
      'rating', (public.pro_rating(r.id) ->> 'avg')::numeric,
      'rating_count', (public.pro_rating(r.id) ->> 'count')::integer,
      'month', (SELECT to_char(pk.t, 'YYYY-MM') FROM pk),
      'kept_paisa', (SELECT coalesce(sum(greatest(coalesce(j.agreed_paisa, 0) - coalesce(j.parts_paisa, 0) - coalesce(j.commission_paisa, 0), 0)), 0)
                     FROM public.jobs j, pk
                     WHERE j.pro_id = r.id AND j.status = 'done'
                       AND to_char(j.finished_at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM') = to_char(pk.t, 'YYYY-MM')),
      'trades', coalesce(
        (SELECT jsonb_agg(t.name ORDER BY t.sort) FROM public.pro_trades x JOIN public.trades t ON t.slug = x.trade
         WHERE x.pro_id = r.id AND x.status IN ('approved', 'trial', 'legacy')),
        (SELECT jsonb_agg(t.name ORDER BY t.sort) FROM public.trades t WHERE t.slug = ANY (r.trades)),
        '[]'::jsonb)
    ) FROM public.pros r WHERE r.id = me.id)
  )
  FROM me
  WHERE me.id IS NOT NULL;
$$;

/** His rating and what customers wrote: revealed ones only, never who wrote them. */
CREATE OR REPLACE FUNCTION public.my_ratings(p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'rating', (public.pro_rating(r.id) ->> 'avg')::numeric,
    'count', (public.pro_rating(r.id) ->> 'count')::integer,
    'jobs_done', (public.pro_rating(r.id) ->> 'jobs_done')::integer,
    'needed', public.setting('rating_min_count'),
    'words', (SELECT coalesce(jsonb_agg(s.w ORDER BY s.at DESC), '[]'::jsonb) FROM (
                SELECT jsonb_build_object('stars', x.stars, 'words', x.words, 'at', x.created_at, 'trade', tt.name) AS w, x.created_at AS at
                FROM public.ratings x
                JOIN public.jobs xj ON xj.id = x.job_id
                LEFT JOIN public.trades tt ON tt.slug = xj.trade
                WHERE x.to_id = r.id AND x.side = 'customer'
                  AND nullif(btrim(coalesce(x.words, '')), '') IS NOT NULL
                  AND public.rating_revealed(x.job_id)
                ORDER BY x.created_at DESC
                LIMIT least(greatest(coalesce(p_limit, 20), 1), 50)) s)
  )
  FROM public.pros r
  WHERE r.id = auth.uid();
$$;

/** A customer correcting her first name: letters only, never a number. */
CREATE OR REPLACE FUNCTION public.set_my_name(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.refuse('Sign in first.');
  END IF;
  IF length(v_name) < 1 THEN
    RETURN public.refuse('Write your first name.', 'name');
  END IF;
  IF length(v_name) > 40 THEN
    RETURN public.refuse('Keep it to 40 letters.', 'name');
  END IF;
  IF v_name ~ '[0-9@]' THEN
    RETURN public.refuse('Use letters only: no numbers.', 'name');
  END IF;
  UPDATE public.profiles SET first_name = v_name, updated_at = now() WHERE id = auth.uid();
  IF NOT FOUND THEN
    RETURN public.refuse('Finish setting up your account first.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'first_name', v_name);
END;
$$;

-- --- Who may call what --------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.my_settings(), public.my_ratings(integer), public.set_my_name(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_settings(), public.my_ratings(integer), public.set_my_name(text) TO authenticated;

INSERT INTO public.applied_migrations (name)
VALUES ('20261128000000_settings_page')
ON CONFLICT (name) DO NOTHING;

COMMIT;

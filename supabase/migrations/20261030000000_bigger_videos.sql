-- =============================================================================
--  Bigger videos: the job-media bucket takes files up to 50 MB
-- =============================================================================
--
--  A phone records about 2 MB of video a second. With the old 30 MB limit
--  almost every real video a customer chose was refused — the owner tried
--  it, and "That video is too big" was all he could get. 50 MB is the most
--  Supabase accepts for one file on its plan, and with the app now asking
--  for at most 20 seconds of video, a normal phone video fits.
--
--  The app checks the same number before it sends anything:
--  `LIMITS.bytes` in apps/mobile/src/post/media.ts. Change the two together.
--  `jobs.test.mjs` fails if this one moves on its own.
--
--  Safe to run twice: it only sets the limit.

BEGIN;

UPDATE storage.buckets
SET file_size_limit = 52428800  -- 50 MB
WHERE id = 'job-media';

INSERT INTO public.applied_migrations (name)
VALUES ('20261030000000_bigger_videos')
ON CONFLICT (name) DO NOTHING;

COMMIT;

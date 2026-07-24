-- ============================================================================
-- PARTYPICK POC — 0003_provider_fixes
-- Verified against live TMDB /watch/providers (US) on 2026-07-24:
--   * Paramount+ id 531 is retired — replaced by tier-specific ids. We use
--     2303 (Paramount Plus Premium) as canonical; variant ids are aliased to
--     canonical ones in supabase/functions/_shared/tmdb.ts.
--   * "Max" is branded "HBO Max" again.
-- (0002 stays as originally applied; history is append-only.)
-- ============================================================================

update streaming_services set tmdb_provider_id = 2303 where slug = 'paramount-plus';
update streaming_services set name = 'HBO Max' where slug = 'max';

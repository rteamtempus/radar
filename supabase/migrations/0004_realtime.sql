-- ============================================================================
-- PARTYPICK POC — 0004_realtime
-- Postgres Changes only broadcasts tables in the supabase_realtime
-- publication. Party clients subscribe to these (filtered by party_id);
-- RLS still applies to what each subscriber receives.
-- ============================================================================

alter publication supabase_realtime add table parties;
alter publication supabase_realtime add table party_members;
alter publication supabase_realtime add table party_mood_checkins;
alter publication supabase_realtime add table party_candidates;
alter publication supabase_realtime add table party_swipes;
alter publication supabase_realtime add table party_votes;
alter publication supabase_realtime add table party_vetoes;

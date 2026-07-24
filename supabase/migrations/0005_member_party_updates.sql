-- ============================================================================
-- PARTYPICK POC — 0005_member_party_updates
-- The outcome pulse ("How was {title}?") can be answered by ANY member and
-- flips the party to 'completed', so party updates open up from host-only to
-- all members. POC posture: fine among friends; revisit for production.
-- ============================================================================

drop policy parties_update on parties;
create policy parties_update on parties
  for update to authenticated using (host_id = auth.uid() or is_party_member(id));

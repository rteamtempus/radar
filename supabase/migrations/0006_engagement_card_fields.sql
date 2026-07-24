-- ============================================================================
-- RADAR — 0006_engagement_card_fields
-- Completes the item-card spec from docs/IDEAS-ANALYSIS.md §1:
--   * notes — my personal note on a title (distinct from post-watch `review`)
--   * recommended_by — free-text "Dave said watch this"; the uuid column links
--     it to a real profile once connections get a UI.
-- ============================================================================

alter table user_engagements
  add column notes text,
  add column recommended_by text,
  add column recommended_by_user_id uuid references profiles(id);

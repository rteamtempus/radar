-- ============================================================================
-- RADAR — 0012_notifications
-- One generic notification inbox for everything social, built to grow:
--
--   * `notifications` is an actor/verb/object row (the activity-stream shape).
--     `verb` is TEXT, not an enum, so a new notification kind is a new
--     producer — never a migration. `payload` carries denormalised display
--     data (title, poster, names) so rendering NEVER needs a join the
--     recipient's RLS might refuse: you are allowed to see that Dana finished
--     the film you sent her even if her history is otherwise private to you.
--   * `group_key` collapses repeats — re-firing the same key updates the row
--     in place and re-unreads it instead of stacking duplicates.
--   * Nobody can INSERT from the client. Every producer is a SECURITY DEFINER
--     trigger or RPC calling notify_user(), so notifications can't be spoofed
--     or spammed. Recipients may only read / mark read / delete their own.
--
-- Producers live in this migration:
--   recommendation_received   recommend_to_friend()      → the friend
--   recommendation_started    engagement → in_progress   → the recommender
--   recommendation_completed  engagement → completed     → the recommender
--   slot_completed            last item of a saved slot  → the slot owner
--   friend_added              add_friend_by_code()       → the new friend
--
-- Release notes are deliberately NOT rows here: notes ship bundled with the
-- build (docs/release-notes → release-notes.generated.ts), so a release costs
-- zero writes. `profiles.last_seen_release_seq` is the only state, and the
-- client renders one synthetic "What's new" entry when it trails the build.
-- ============================================================================

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,  -- recipient
  actor_id    uuid references profiles(id) on delete set null,          -- null = system
  verb        text not null,
  object_type text,                        -- 'activity' | 'slot' | 'profile' | 'party' | …
  object_id   text,                        -- text, so non-uuid keys stay legal
  link        text,                        -- in-app route to open on tap
  payload     jsonb not null default '{}'::jsonb,
  group_key   text,                        -- collapse repeats (see notify_user)
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index notifications_user_idx on notifications(user_id, created_at desc);
create index notifications_unread_idx on notifications(user_id) where read_at is null;
create unique index notifications_group_idx on notifications(user_id, group_key)
  where group_key is not null;

alter table notifications enable row level security;

-- Read / mark-read / dismiss your own. No insert policy on purpose — see the
-- header. (The update policy can't be narrowed to read_at in RLS; producers
-- are definer functions, so a client rewriting its own row hurts only itself.)
create policy notifications_owner_read on notifications
  for select to authenticated using (user_id = auth.uid());
create policy notifications_owner_update on notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_owner_delete on notifications
  for delete to authenticated using (user_id = auth.uid());

-- Live badge updates without polling (RLS still filters per subscriber).
alter publication supabase_realtime add table notifications;

-- ---- the one producer entry point ------------------------------------------
-- Not granted to `authenticated`: only SECURITY DEFINER callers reach it.

create or replace function notify_user(
  p_user        uuid,
  p_actor       uuid,
  p_verb        text,
  p_object_type text default null,
  p_object_id   text default null,
  p_link        text default null,
  p_payload     jsonb default '{}'::jsonb,
  p_group_key   text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  -- never notify someone about their own action
  if p_user is null or p_user = p_actor then return null; end if;

  if p_group_key is null then
    insert into notifications (user_id, actor_id, verb, object_type, object_id, link, payload)
    values (p_user, p_actor, p_verb, p_object_type, p_object_id, p_link,
            coalesce(p_payload, '{}'::jsonb))
    returning id into v_id;
  else
    insert into notifications (user_id, actor_id, verb, object_type, object_id, link,
                               payload, group_key)
    values (p_user, p_actor, p_verb, p_object_type, p_object_id, p_link,
            coalesce(p_payload, '{}'::jsonb), p_group_key)
    on conflict (user_id, group_key) where group_key is not null
    do update set actor_id   = excluded.actor_id,
                  verb       = excluded.verb,
                  link       = excluded.link,
                  payload    = excluded.payload,
                  created_at = now(),
                  read_at    = null          -- a repeat is news again
    returning id into v_id;
  end if;

  return v_id;
end $$;

revoke all on function notify_user(uuid, uuid, text, text, text, text, jsonb, text) from public;

-- ---- producer: engagement status changes -----------------------------------
-- UPDATE only, deliberately: the Netflix importer INSERTS hundreds of
-- already-completed rows, and nobody wants that as an inbox.

create or replace function notify_engagement_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_activity   record;
  v_actor_name text;
  v_sub        record;
  v_total      int;
  v_done       int;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status not in ('in_progress', 'completed') then return new; end if;

  select title, type::text as type, image_url
    into v_activity from activities where id = new.activity_id;
  select display_name into v_actor_name from profiles where id = new.user_id;

  -- 1. the person who recommended it hears how it went
  if new.recommended_by_user_id is not null and new.visibility = 'friends' then
    perform notify_user(
      new.recommended_by_user_id,
      new.user_id,
      case when new.status = 'completed'
           then 'recommendation_completed' else 'recommendation_started' end,
      'activity',
      new.activity_id::text,
      '/library/' || new.activity_id::text,
      jsonb_build_object(
        'title', v_activity.title,
        'image_url', v_activity.image_url,
        'activity_type', v_activity.type,
        'actor_name', v_actor_name,
        'rating', new.rating
      ),
      'rec:' || new.status::text || ':' || new.activity_id::text || ':' || new.user_id::text
    );
  end if;

  -- 2. finishing this may have cleared a slot they saved from someone
  if new.status = 'completed' then
    for v_sub in
      select s.id, s.name, s.emoji, s.owner_id
      from slot_subscriptions ss
      join radar_slots s on s.id = ss.slot_id
      where ss.subscriber_id = new.user_id
        and s.owner_id is not null
        and exists (
          select 1 from radar_slot_items i
          where i.slot_id = s.id and i.activity_id = new.activity_id
        )
    loop
      select count(*) into v_total from radar_slot_items where slot_id = v_sub.id;
      select count(*) into v_done
        from radar_slot_items i
        join user_engagements e
          on e.activity_id = i.activity_id and e.user_id = new.user_id
       where i.slot_id = v_sub.id and e.status = 'completed';

      if v_total > 0 and v_done >= v_total then
        perform notify_user(
          v_sub.owner_id,
          new.user_id,
          'slot_completed',
          'slot',
          v_sub.id::text,
          '/radar/slot/' || v_sub.id::text,
          jsonb_build_object(
            'slot_name', v_sub.name,
            'slot_emoji', v_sub.emoji,
            'actor_name', v_actor_name,
            'item_count', v_total
          ),
          -- one per (slot, finisher): re-clearing a grown slot notifies again
          'slotdone:' || v_sub.id::text || ':' || new.user_id::text || ':' || v_total::text
        );
      end if;
    end loop;
  end if;

  return new;
end $$;

create trigger user_engagements_notify
  after update on user_engagements
  for each row execute function notify_engagement_change();

-- ---- producer: recommend_to_friend (0010 body + the notification) ----------

create or replace function recommend_to_friend(p_friend_id uuid, p_activity_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_slot uuid;
  v_my_name text;
  v_domain text;
  v_activity record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not is_friend(p_friend_id) then raise exception 'You are not friends'; end if;

  select display_name into v_my_name from profiles where id = auth.uid();
  select title, type::text as type, image_url,
         case type::text
           when 'restaurant' then 'eat'
           when 'outing' then 'do'
           when 'book' then 'read'
           else 'watch'
         end as domain
    into v_activity from activities where id = p_activity_id;
  if not found then raise exception 'Unknown activity'; end if;
  v_domain := v_activity.domain;

  select id into v_slot from radar_slots
  where owner_id = p_friend_id
    and config->>'role' = 'recommended'
    and coalesce(config->>'domain', 'watch') = v_domain
  limit 1;
  if v_slot is null then
    insert into radar_slots (owner_id, name, emoji, on_complete, position, config)
    values (
      p_friend_id, 'Recommended to me', '💡', 'remove',
      (select coalesce(max(position), -1) + 1 from radar_slots where owner_id = p_friend_id),
      jsonb_build_object('role', 'recommended', 'domain', v_domain)
    )
    returning id into v_slot;
  end if;

  insert into radar_slot_items (slot_id, activity_id, position, added_by)
  values (
    v_slot, p_activity_id,
    (select coalesce(max(position), -1) + 1 from radar_slot_items where slot_id = v_slot),
    auth.uid()
  )
  on conflict (slot_id, activity_id) do nothing;

  insert into user_engagements (user_id, activity_id, recommended_by, recommended_by_user_id, source)
  values (p_friend_id, p_activity_id, v_my_name, auth.uid(), 'recommendation')
  on conflict (user_id, activity_id) do update
    set recommended_by = coalesce(user_engagements.recommended_by, excluded.recommended_by),
        recommended_by_user_id = coalesce(user_engagements.recommended_by_user_id, excluded.recommended_by_user_id);

  perform notify_user(
    p_friend_id, auth.uid(), 'recommendation_received',
    'activity', p_activity_id::text, '/library/' || p_activity_id::text,
    jsonb_build_object(
      'title', v_activity.title,
      'image_url', v_activity.image_url,
      'activity_type', v_activity.type,
      'actor_name', v_my_name,
      'domain', v_domain
    ),
    'recin:' || p_activity_id::text || ':' || auth.uid()::text
  );
end $$;

-- ---- producer: add_friend_by_code (0008 body + the notification) -----------

create or replace function add_friend_by_code(p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_friend uuid;
  v_my_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select id into v_friend from profiles where friend_code = upper(trim(p_code));
  if v_friend is null then raise exception 'No one has that friend code'; end if;
  if v_friend = auth.uid() then raise exception 'That is your own code'; end if;

  update connections set status = 'accepted'
  where user_id = v_friend and friend_id = auth.uid() and status = 'pending';
  if not found then
    insert into connections (user_id, friend_id, status)
    values (auth.uid(), v_friend, 'accepted')
    on conflict (user_id, friend_id) do update set status = 'accepted';
  end if;

  select display_name into v_my_name from profiles where id = auth.uid();
  perform notify_user(
    v_friend, auth.uid(), 'friend_added',
    'profile', auth.uid()::text, '/friends/' || auth.uid()::text,
    jsonb_build_object('actor_name', v_my_name),
    'friend:' || auth.uid()::text
  );

  return v_friend;
end $$;

-- ---- release-note read state -----------------------------------------------
-- The highest release `seq` (see docs/release-notes) this user has opened.
-- Existing accounts start at 0 so the backfilled history shows up once;
-- brand-new accounts are stamped to the current build by the client, because
-- "what's new since you were last here" is meaningless on day one.

alter table profiles add column last_seen_release_seq int;
update profiles set last_seen_release_seq = 0 where last_seen_release_seq is null;

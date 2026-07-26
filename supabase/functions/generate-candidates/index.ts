// generate-candidates — the pipeline (handoff §7)
//
// POST { party_id } (auth: must be the host). Builds a candidate pool, hard
// filters, deterministic least-misery scoring (scoring.ts), one Gemini rerank
// for 12 + blurbs (bulletproof fallback), writes party_candidates, flips the
// party to 'swiping'. Every Gemini call — success or failure — logs to
// ai_invocations.
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { geminiJson } from '../_shared/gemini.ts';
import { HttpError, json, serve } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import {
  ActivityRow,
  TmdbKind,
  tmdbDiscover,
  tmdbGenres,
  refreshAvailability,
  upsertActivity,
} from '../_shared/tmdb.ts';
import {
  CandidateFacts,
  MemberFacts,
  ScoredCandidate,
  scoreCandidates,
} from './scoring.ts';

const RERANK_INPUT_SIZE = 30;
// gemini-2.5-flash list pricing per 1M tokens (approximate — cost tracking only)
const PRICE_IN = 0.3;
const PRICE_OUT = 2.5;

interface PoolActivity extends ActivityRow {
  duration_min: number | null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function pooled<T>(items: T[], size: number, run: (item: T) => Promise<unknown>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
        await run(item).catch((e) => console.error('pooled task failed:', e?.message ?? e));
      }
    }),
  );
}

function parseExternalId(externalId: string | null): { kind: TmdbKind; tmdbId: number } | null {
  const m = externalId?.match(/^(movie|tv)-(\d+)$/);
  return m ? { kind: m[1] as TmdbKind, tmdbId: Number(m[2]) } : null;
}

serve(async (req) => {
  const user = await requireUser(req);
  const { party_id } = await req.json().catch(() => ({}));
  if (typeof party_id !== 'string') throw new HttpError(400, 'Expected body { party_id: string }');

  const db = serviceClient();

  // ---- step 0: gather context ----------------------------------------------
  const { data: party } = await db
    .from('parties')
    .select('id, host_id, status, activity_type, constraints, decision_config')
    .eq('id', party_id)
    .single();
  if (!party) throw new HttpError(404, 'Party not found');
  if (party.host_id !== user.id) throw new HttpError(403, 'Only the host can generate candidates');
  if (['completed', 'cancelled'].includes(party.status)) {
    throw new HttpError(409, 'This party is over');
  }

  const { data: memberRows } = await db
    .from('party_members')
    .select('id, user_id')
    .eq('party_id', party_id)
    .not('user_id', 'is', null);
  const members = memberRows ?? [];
  if (!members.length) throw new HttpError(422, 'Nobody is in this party yet');
  const userIds = members.map((m) => m.user_id as string);

  const [subsRes, servicesRes, engRes, affRes, dealRes, checkinRes, vibeRes, priorRes] =
    await Promise.all([
      db.from('user_subscriptions').select('user_id, service_id').eq('is_active', true).in('user_id', userIds),
      db.from('streaming_services').select('id, slug, tmdb_provider_id'),
      db.from('user_engagements').select('user_id, activity_id, status, rating, is_rewatchable').in('user_id', userIds),
      db.from('user_tag_affinities').select('user_id, tag_id, weight').in('user_id', userIds),
      db.from('user_dealbreakers').select('user_id, kind, value').eq('is_active', true).in('user_id', userIds),
      db.from('party_mood_checkins').select('member_id, energy, mood_tags, free_text').in('member_id', members.map((m) => m.id)),
      db.from('tags').select('id, slug, kind'),
      db.from('party_candidates').select('activity_id').eq('party_id', party_id),
    ]);

  const services = servicesRes.data ?? [];
  const serviceById = new Map(services.map((s) => [s.id as string, s]));
  const subsByUser = new Map<string, Set<string>>(userIds.map((u) => [u, new Set<string>()]));
  for (const s of subsRes.data ?? []) subsByUser.get(s.user_id)?.add(s.service_id);

  const sharedServiceIds = userIds.reduce<Set<string>>(
    (acc, u) => new Set([...acc].filter((id) => subsByUser.get(u)?.has(id))),
    new Set(subsByUser.get(userIds[0]) ?? []),
  );
  const mustStreamAll = party.constraints?.must_be_streamable_by_all !== false;
  if (mustStreamAll && sharedServiceIds.size === 0) {
    throw new HttpError(
      422,
      "No streaming service everyone shares — update subscriptions in You, or turn off 'only things everyone can stream'.",
    );
  }
  const unionServiceIds = new Set([...subsByUser.values()].flatMap((s) => [...s]));
  const discoverServiceIds = sharedServiceIds.size ? sharedServiceIds : unionServiceIds;
  const discoverProviderIds = [...discoverServiceIds]
    .map((id) => serviceById.get(id)?.tmdb_provider_id)
    .filter((n): n is number => typeof n === 'number');

  const tagById = new Map((vibeRes.data ?? []).map((t) => [t.id as string, t]));
  const engByUser = new Map<string, Record<string, { status: string; rating: number | null; is_rewatchable: boolean | null }>>(
    userIds.map((u) => [u, {}]),
  );
  for (const e of engRes.data ?? []) {
    engByUser.get(e.user_id)![e.activity_id] = {
      status: e.status,
      rating: e.rating,
      is_rewatchable: e.is_rewatchable,
    };
  }
  const affByUser = new Map<string, Record<string, number>>(userIds.map((u) => [u, {}]));
  for (const a of affRes.data ?? []) affByUser.get(a.user_id)![a.tag_id] = a.weight;

  const checkinByMember = new Map((checkinRes.data ?? []).map((c) => [c.member_id as string, c]));
  const memberFacts: MemberFacts[] = members.map((m) => {
    const checkin = checkinByMember.get(m.id);
    return {
      userId: m.user_id as string,
      affinities: affByUser.get(m.user_id as string) ?? {},
      engagements: engByUser.get(m.user_id as string) ?? {},
      vibeSlugs: (checkin?.mood_tags ?? [])
        .map((id: string) => tagById.get(id)?.slug)
        .filter((s: string | undefined): s is string => !!s),
    };
  });

  const dealbreakerTagIds = new Set(
    (dealRes.data ?? [])
      .filter((d) => d.kind === 'content_warning')
      .map((d) => (d.value as { tag_id?: string })?.tag_id)
      .filter((t): t is string => !!t),
  );
  const priorIds = new Set((priorRes.data ?? []).map((c) => c.activity_id as string));

  // ---- step 1: candidate pool ----------------------------------------------
  const kinds: TmdbKind[] =
    party.activity_type === 'movie' ? ['movie'] : party.activity_type === 'tv_show' ? ['tv'] : ['movie', 'tv'];

  // Quest-from-a-slot (idea #3): the pool is exactly one slot's items —
  // no discover, no want_to sweep. Host must be able to view the slot.
  const sourceSlotId = party.constraints?.source_slot_id as string | undefined | null;
  const slotPoolIds = new Set<string>();
  if (sourceSlotId) {
    const { data: slot } = await db
      .from('radar_slots')
      .select('id, owner_id, visibility')
      .eq('id', sourceSlotId)
      .maybeSingle();
    if (!slot) throw new HttpError(404, 'Source slot not found');
    const hostCanView =
      slot.owner_id === user.id ||
      slot.visibility === 'public' ||
      (slot.visibility === 'friends' &&
        (
          await db
            .from('connections')
            .select('user_id')
            .eq('status', 'accepted')
            .or(
              `and(user_id.eq.${user.id},friend_id.eq.${slot.owner_id}),and(user_id.eq.${slot.owner_id},friend_id.eq.${user.id})`,
            )
            .limit(1)
        ).data?.length);
    if (!hostCanView) throw new HttpError(403, 'You cannot use that slot');
    const { data: slotItems } = await db
      .from('radar_slot_items')
      .select('activity_id')
      .eq('slot_id', sourceSlotId);
    for (const row of slotItems ?? []) slotPoolIds.add(row.activity_id);
    if (!slotPoolIds.size) throw new HttpError(422, 'That slot is empty');
  }

  // 1a. everyone's want_to lists (highest-signal candidates)
  const wantToIds = new Set<string>();
  if (!sourceSlotId) {
    for (const eng of engByUser.values()) {
      for (const [activityId, e] of Object.entries(eng)) if (e.status === 'want_to') wantToIds.add(activityId);
    }
  }

  // 1b. TMDB discover: popularity + top-genre targeted, on the group's providers
  const discovered = new Map<string, ActivityRow>(); // by activity id — known streamable
  if (!sourceSlotId && discoverProviderIds.length) {
    const genreTags = (vibeRes.data ?? []).filter((t) => t.kind === 'genre');
    const genreAvg = genreTags
      .map((t) => ({
        tag: t,
        avg: userIds.reduce((s, u) => s + (affByUser.get(u)?.[t.id] ?? 0), 0) / userIds.length,
      }))
      .filter((g) => g.avg > 0.05)
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 2);
    const genreNamesById = await tmdbGenres();
    const genreIdBySlug = new Map<string, number>();
    for (const [id, name] of genreNamesById) {
      genreIdBySlug.set(name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), id);
    }

    const discoverCalls: { kind: TmdbKind; page?: number; withGenreId?: number }[] = [];
    for (const kind of kinds) {
      discoverCalls.push({ kind, page: 1 }, { kind, page: 2 });
      for (const g of genreAvg) {
        const genreId = genreIdBySlug.get(g.tag.slug);
        if (genreId) discoverCalls.push({ kind, withGenreId: genreId });
      }
    }

    await pooled(discoverCalls, 4, async (call) => {
      const { results } = await tmdbDiscover(call.kind, {
        withProviders: discoverProviderIds,
        page: call.page,
        withGenreId: call.withGenreId,
      });
      await pooled(results.filter((r) => r.poster_path).slice(0, 20), 6, async (item) => {
        const row = await upsertActivity(
          db,
          call.kind,
          item,
          (item.genre_ids ?? []).map((id) => genreNamesById.get(id)).filter((g): g is string => !!g),
        );
        discovered.set(row.id, row);
      });
    });
  }

  // 1c. local activities already available on the shared services
  const localIds = new Set<string>();
  if (!sourceSlotId && sharedServiceIds.size) {
    const { data: local } = await db
      .from('activity_availability')
      .select('activity_id')
      .eq('region', 'US')
      .eq('offer', 'subscription')
      .in('service_id', [...sharedServiceIds])
      .limit(400);
    for (const row of local ?? []) localIds.add(row.activity_id);
  }

  const poolIds = sourceSlotId
    ? slotPoolIds
    : new Set<string>([...wantToIds, ...localIds, ...discovered.keys()]);

  // Load rows + tags + availability for the whole pool
  const activityById = new Map<string, PoolActivity>(
    [...discovered.values()].map((a) => [a.id, a as PoolActivity]),
  );
  const toLoad = [...poolIds].filter((id) => !activityById.has(id));
  for (const ids of chunk(toLoad, 100)) {
    const { data } = await db
      .from('activities')
      .select('id, type, title, description, image_url, duration_min, external_source, external_id, metadata')
      .in('id', ids);
    for (const a of data ?? []) activityById.set(a.id, a as PoolActivity);
  }

  // Hydrate availability for want_to titles that have none yet (bounded)
  const { availByActivity, tagsByActivity } = await loadPoolJoins(db, [...poolIds]);
  const wantToMissing = [...wantToIds]
    .filter((id) => !availByActivity.has(id))
    .map((id) => activityById.get(id))
    .filter((a): a is PoolActivity => !!a)
    .slice(0, 20);
  if (wantToMissing.length) {
    await pooled(wantToMissing, 4, async (a) => {
      const ext = parseExternalId(a.external_id);
      if (ext) await refreshAvailability(db, a.id, ext.kind, ext.tmdbId);
    });
    const refreshed = await loadPoolJoins(db, wantToMissing.map((a) => a.id));
    for (const [k, v] of refreshed.availByActivity) availByActivity.set(k, v);
  }

  // ---- step 2: hard filters ------------------------------------------------
  const maxRuntime = party.constraints?.max_duration_min ?? null;
  const wantedTypes = new Set(kinds.map((k) => (k === 'movie' ? 'movie' : 'tv_show')));

  const survivors: CandidateFacts[] = [];
  for (const id of poolIds) {
    const a = activityById.get(id);
    if (!a) continue;
    if (!wantedTypes.has(a.type)) continue;
    if (priorIds.has(id)) continue;
    if (maxRuntime && a.duration_min && a.duration_min > maxRuntime) continue;
    if (mustStreamAll) {
      const avail = availByActivity.get(id) ?? new Set<string>();
      const onShared = [...sharedServiceIds].some((s) => avail.has(s));
      // Slot pools: the group explicitly chose this list — unknown
      // availability passes rather than emptying the deck.
      const unknownPasses = sourceSlotId ? avail.size === 0 : discovered.has(id);
      if (!onShared && !unknownPasses) continue;
    }
    const excluded = memberFacts.some((m) => {
      const e = m.engagements[id];
      return !!e && (e.status === 'not_interested' || (e.status === 'completed' && !e.is_rewatchable));
    });
    if (excluded) continue;
    const tags = tagsByActivity.get(id) ?? [];
    if (tags.some((t) => dealbreakerTagIds.has(t.id))) continue;

    survivors.push({
      activityId: id,
      type: a.type as 'movie' | 'tv_show',
      tagIds: tags.map((t) => t.id),
      genreSlugs: tags.filter((t) => t.kind === 'genre').map((t) => t.slug),
      tmdbVote: (a.metadata?.['tmdb_vote'] as number | null) ?? null,
    });
  }
  if (!survivors.length) {
    throw new HttpError(422, 'No candidates survived the filters — try loosening the constraints.');
  }

  // ---- step 3: deterministic scoring --------------------------------------
  const ranked = scoreCandidates(survivors, memberFacts).slice(0, RERANK_INPUT_SIZE);

  // ---- step 4: AI rerank + blurbs (never hard-fails) -----------------------
  const candidateCount = Math.min(party.decision_config?.candidate_count ?? 12, ranked.length);
  const { picks, aiUsed } = await rerankWithGemini(db, party_id, ranked, {
    memberCount: members.length,
    checkins: [...checkinByMember.values()],
    tagById,
    maxRuntime,
    activityById,
    count: candidateCount,
  });

  // Refresh availability for finalists that have none (swipe cards show badges)
  const finalMissing = picks.filter((p) => !availByActivity.has(p.scored.candidate.activityId));
  await pooled(finalMissing, 4, async (p) => {
    const a = activityById.get(p.scored.candidate.activityId);
    const ext = a ? parseExternalId(a.external_id) : null;
    if (a && ext) await refreshAvailability(db, a.id, ext.kind, ext.tmdbId);
  });

  const rows = picks.map((p, i) => ({
    party_id,
    activity_id: p.scored.candidate.activityId,
    final_score: p.scored.finalScore,
    score_breakdown: {
      per_member: p.scored.perMember,
      taste_min: Math.min(...Object.values(p.scored.perMember)),
      taste_avg:
        Object.values(p.scored.perMember).reduce((a, b) => a + b, 0) /
        Object.keys(p.scored.perMember).length,
      ai_rank: aiUsed ? i + 1 : null,
    },
    ai_blurb: p.blurb,
    presented_order: i + 1,
  }));
  const { error: insertError } = await db.from('party_candidates').insert(rows);
  if (insertError) throw new HttpError(500, `Could not save candidates: ${insertError.message}`);

  await db.from('parties').update({ status: 'swiping' }).eq('id', party_id);

  return json({
    candidates: rows.map((r) => ({
      activity_id: r.activity_id,
      presented_order: r.presented_order,
      final_score: r.final_score,
      ai_blurb: r.ai_blurb,
      title: activityById.get(r.activity_id)?.title,
    })),
    ai_used: aiUsed,
  });
});

async function loadPoolJoins(db: SupabaseClient, ids: string[]) {
  const availByActivity = new Map<string, Set<string>>();
  const tagsByActivity = new Map<string, { id: string; slug: string; kind: string }[]>();
  for (const batch of chunk(ids, 100)) {
    const [avail, tags] = await Promise.all([
      db
        .from('activity_availability')
        .select('activity_id, service_id')
        .eq('region', 'US')
        .eq('offer', 'subscription')
        .in('activity_id', batch),
      db.from('activity_tags').select('activity_id, tag:tags(id, slug, kind)').in('activity_id', batch),
    ]);
    for (const row of avail.data ?? []) {
      if (!availByActivity.has(row.activity_id)) availByActivity.set(row.activity_id, new Set());
      availByActivity.get(row.activity_id)!.add(row.service_id);
    }
    for (const row of (tags.data ?? []) as unknown as {
      activity_id: string;
      tag: { id: string; slug: string; kind: string };
    }[]) {
      if (!tagsByActivity.has(row.activity_id)) tagsByActivity.set(row.activity_id, []);
      tagsByActivity.get(row.activity_id)!.push(row.tag);
    }
  }
  return { availByActivity, tagsByActivity };
}

interface RerankContext {
  memberCount: number;
  checkins: { energy: number | null; mood_tags: string[]; free_text: string | null }[];
  tagById: Map<string, { slug: string }>;
  maxRuntime: number | null;
  activityById: Map<string, PoolActivity>;
  count: number;
}

async function rerankWithGemini(
  db: SupabaseClient,
  partyId: string,
  ranked: ScoredCandidate[],
  ctx: RerankContext,
): Promise<{ picks: { scored: ScoredCandidate; blurb: string }[]; aiUsed: boolean }> {
  const byId = new Map(ranked.map((r) => [r.candidate.activityId, r]));

  const fallbackBlurb = (s: ScoredCandidate) => {
    const genre = s.candidate.genreSlugs[0]?.replace(/-/g, ' ');
    return genre
      ? `Strong ${genre} pick that scores well across the group.`
      : `Scores well across the whole group tonight.`;
  };
  const fallback = () => ({
    picks: ranked.slice(0, ctx.count).map((s) => ({ scored: s, blurb: fallbackBlurb(s) })),
    aiUsed: false,
  });

  const energies = ctx.checkins.map((c) => c.energy).filter((e): e is number => e != null);
  const vibes = [
    ...new Set(
      ctx.checkins.flatMap((c) => c.mood_tags.map((id) => ctx.tagById.get(id)?.slug).filter(Boolean)),
    ),
  ];
  const freeTexts = ctx.checkins.map((c) => c.free_text).filter((t): t is string => !!t?.trim());

  const lines = ranked.map((s) => {
    const a = ctx.activityById.get(s.candidate.activityId);
    const year = (a?.metadata?.['release_year'] as number | undefined) ?? '?';
    const genres = s.candidate.genreSlugs.join('/') || '-';
    return `${s.candidate.activityId} | ${a?.title} (${year}) | ${s.candidate.type} | ${a?.duration_min ?? '?'}min | ${genres} | vote ${s.candidate.tmdbVote ?? '?'} | score ${s.finalScore.toFixed(2)}`;
  });

  const userText = [
    `Group: ${ctx.memberCount} people.`,
    energies.length ? `Energy (1-5): avg ${(energies.reduce((a, b) => a + b, 0) / energies.length).toFixed(1)}.` : '',
    vibes.length ? `Vibes tonight: ${vibes.join(', ')}.` : '',
    freeTexts.length ? `In their own words: ${freeTexts.map((t) => `"${t}"`).join(' · ')}` : '',
    ctx.maxRuntime ? `Runtime cap: ${ctx.maxRuntime} minutes.` : '',
    '',
    'Candidates (id | title (year) | type | runtime | tags | tmdb vote | group score):',
    ...lines,
    '',
    `Pick the best ${ctx.count} for this group. Return exactly ${ctx.count} items ranked 1-${ctx.count}. blurb is one sentence (<20 words) telling the group why it fits them tonight. Prioritize the mood free-texts over general popularity. Use only ids from the list.`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const result = await geminiJson<{ id: string; rank: number; blurb: string }[]>({
      systemInstruction: 'You pick what a group should watch tonight. Be decisive and specific.',
      userText,
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING' },
            rank: { type: 'INTEGER' },
            blurb: { type: 'STRING' },
          },
          required: ['id', 'rank', 'blurb'],
        },
      },
    });

    await db.from('ai_invocations').insert({
      purpose: 'party_rerank',
      party_id: partyId,
      model: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cost_usd: (result.inputTokens * PRICE_IN + result.outputTokens * PRICE_OUT) / 1e6,
    });

    // Defensive parse even with the schema enforced (handoff §7 step 4)
    const seen = new Set<string>();
    const valid = (Array.isArray(result.data) ? result.data : [])
      .filter((item) => byId.has(item.id) && !seen.has(item.id) && seen.add(item.id))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, ctx.count)
      .map((item) => ({ scored: byId.get(item.id)!, blurb: item.blurb || fallbackBlurb(byId.get(item.id)!) }));

    // Top off from the deterministic ranking if the model returned too few
    for (const s of ranked) {
      if (valid.length >= ctx.count) break;
      if (!seen.has(s.candidate.activityId)) {
        seen.add(s.candidate.activityId);
        valid.push({ scored: s, blurb: fallbackBlurb(s) });
      }
    }
    return valid.length ? { picks: valid, aiUsed: true } : fallback();
  } catch (e) {
    console.error('Gemini rerank failed, using deterministic fallback:', e);
    await db.from('ai_invocations').insert({
      purpose: 'party_rerank',
      party_id: partyId,
      model: 'gemini-2.5-flash',
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
    });
    return fallback();
  }
}

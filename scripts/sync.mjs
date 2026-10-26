// Synchronisation des clubs Projet X : API Brawl Stars -> Supabase.
import { createClient } from '@supabase/supabase-js';
import { bsGet, encTag } from './bsapi.mjs';

const { SUPABASE_URL, SUPABASE_SECRET_KEY, BRAWL_STARS_API_KEY } = process.env;
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SECRET_KEY, BRAWL_STARS_API_KEY })) {
  if (!v) { console.error(`Variable manquante : ${k}`); process.exit(1); }
}

const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const ANOMALY_THRESHOLD = 2000; // variation de trophées jugée suspecte entre deux relevés

const must = (res, label) => {
  if (res.error) throw new Error(`${label} : ${res.error.message}`);
  return res.data;
};
const chunks = (arr, n = 500) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const trigger = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' ? 'manual' : 'scheduler';
const run = must(
  await db.from('sync_runs').insert({ trigger_source: trigger }).select('id').single(),
  'Création du journal'
);

let status = 'failed';
let errorText = null;
let clubsProcessed = 0, membersProcessed = 0, snapshotsWritten = 0;

try {
  const clubsDb = must(await db.from('clubs').select('tag').eq('is_active', true), 'Lecture clubs');
  const existingRows = must(
    await db.from('club_members').select('tag,name,club_tag,is_member,trophies'),
    'Lecture membres'
  );
  const existing = new Map(existingRows.map((r) => [r.tag, r]));
  const firstRun = existing.size === 0;

  // 1) Récupération des clubs (une erreur sur un club n'arrête pas les autres)
  const fetched = [];
  const errors = [];
  for (const c of clubsDb) {
    try {
      const data = await bsGet(`/clubs/${encTag(c.tag)}`);
      fetched.push({ tag: c.tag, data });
    } catch (e) {
      if (e.fatal) throw e;
      errors.push(`${c.tag} : ${e.message}`);
    }
  }
  if (fetched.length === 0) throw new Error(errors.join(' | ') || 'Aucun club récupéré');

  const now = new Date().toISOString();
  const fetchedTags = new Set(fetched.map((f) => f.tag));

  // 2) Clubs
  const clubRows = fetched.map(({ tag, data }) => ({
    tag,
    name: data.name,
    description: data.description ?? null,
    badge_id: data.badgeId ?? null,
    club_type: data.type ?? null,
    required_trophies: data.requiredTrophies ?? null,
    member_count: data.members.length,
    trophies: data.trophies ?? 0,
    last_updated_at: now,
  }));
  must(await db.from('clubs').upsert(clubRows, { onConflict: 'tag' }), 'Mise à jour clubs');

  // 3) Membres actuels + événements
  const memberRows = [];
  const events = [];
  const present = new Set();
  for (const { tag: clubTag, data } of fetched) {
    for (const m of data.members) {
      present.add(m.tag);
      const prev = existing.get(m.tag);
      if (!firstRun) {
        if (!prev || !prev.is_member) {
          events.push({ member_tag: m.tag, club_tag: clubTag, event_type: 'joined', new_value: clubTag });
        } else if (prev.club_tag !== clubTag) {
          events.push({ member_tag: m.tag, club_tag: clubTag, event_type: 'moved', old_value: prev.club_tag, new_value: clubTag });
        }
        if (prev && prev.name !== m.name) {
          events.push({ member_tag: m.tag, club_tag: clubTag, event_type: 'renamed', old_value: prev.name, new_value: m.name });
        }
        if (prev && Math.abs(m.trophies - prev.trophies) > ANOMALY_THRESHOLD) {
          events.push({ member_tag: m.tag, club_tag: clubTag, event_type: 'anomaly', old_value: String(prev.trophies), new_value: String(m.trophies) });
        }
      }
      memberRows.push({
        tag: m.tag, name: m.name, club_tag: clubTag, role: m.role ?? null,
        trophies: m.trophies, is_member: true, last_updated_at: now, left_at: null,
      });
    }
  }

  // 4) Départs : seulement pour les clubs réellement récupérés
  const leftTags = [];
  for (const [tag, prev] of existing) {
    if (prev.is_member && !present.has(tag) && fetchedTags.has(prev.club_tag)) {
      leftTags.push(tag);
      events.push({ member_tag: tag, club_tag: prev.club_tag, event_type: 'left', old_value: prev.club_tag });
    }
  }

  for (const part of chunks(memberRows)) {
    must(await db.from('club_members').upsert(part, { onConflict: 'tag' }), 'Mise à jour membres');
  }
  if (leftTags.length) {
    must(
      await db.from('club_members').update({ is_member: false, club_tag: null, left_at: now, last_updated_at: now }).in('tag', leftTags),
      'Départs'
    );
  }

  // 5) Relevés historiques (sans doublon grâce à l'unicité par synchro)
  const memberSnaps = memberRows.map((r) => ({
    run_id: run.id, member_tag: r.tag, club_tag: r.club_tag, taken_at: now, trophies: r.trophies,
  }));
  for (const part of chunks(memberSnaps)) {
    must(
      await db.from('member_snapshots').upsert(part, { onConflict: 'run_id,member_tag', ignoreDuplicates: true }),
      'Relevés membres'
    );
  }
  const clubSnaps = fetched.map(({ tag, data }) => ({
    run_id: run.id, club_tag: tag, taken_at: now,
    member_count: data.members.length, trophies: data.trophies ?? 0,
    required_trophies: data.requiredTrophies ?? null,
  }));
  must(
    await db.from('club_snapshots').upsert(clubSnaps, { onConflict: 'run_id,club_tag', ignoreDuplicates: true }),
    'Relevés clubs'
  );

  for (const part of chunks(events)) {
    must(await db.from('member_events').insert(part), 'Événements');
  }

  clubsProcessed = fetched.length;
  membersProcessed = memberRows.length;
  snapshotsWritten = memberSnaps.length + clubSnaps.length;
  status = errors.length ? 'partial' : 'success';
  errorText = errors.length ? errors.join(' | ') : null;
  console.log(`OK : ${clubsProcessed} clubs, ${membersProcessed} membres, ${snapshotsWritten} relevés, ${events.length} événements, ${leftTags.length} départs.`);
  if (errors.length) console.log(`::warning::Clubs en erreur : ${errors.join(' | ')}`);
} catch (e) {
  status = 'failed';
  errorText = e.message;
  console.error(`::error::Échec de la synchronisation : ${e.message}`);
}

const upd = await db
  .from('sync_runs')
  .update({
    finished_at: new Date().toISOString(),
    status,
    clubs_processed: clubsProcessed,
    members_processed: membersProcessed,
    snapshots_written: snapshotsWritten,
    error: errorText ? errorText.slice(0, 1000) : null,
  })
  .eq('id', run.id);
if (upd.error) console.error(`Journal non mis à jour : ${upd.error.message}`);

process.exit(status === 'failed' ? 1 : 0);

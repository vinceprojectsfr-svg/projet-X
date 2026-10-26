// Relevé ranked : profil de chaque joueur actif -> Supabase (toutes les 6 h).
import { createClient } from '@supabase/supabase-js';
import { bsGet, encTag } from './bsapi.mjs';

const { SUPABASE_URL, SUPABASE_SECRET_KEY, BRAWL_STARS_API_KEY } = process.env;
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SECRET_KEY, BRAWL_STARS_API_KEY })) {
  if (!v) { console.error(`Variable manquante : ${k}`); process.exit(1); }
}

const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const CONCURRENCY = 3;     // requêtes en parallèle
const PAUSE_MS = 250;      // pause entre deux requêtes d'un même "ouvrier"

const must = (res, label) => {
  if (res.error) throw new Error(`${label} : ${res.error.message}`);
  return res.data;
};
const chunks = (arr, n = 500) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const trigger = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' ? 'manual' : 'scheduler';
const run = must(
  await db.from('sync_runs').insert({ trigger_source: trigger, kind: 'ranked' }).select('id').single(),
  'Création du journal'
);

let status = 'failed', errorText = null, processed = 0, written = 0;

try {
  const members = must(
    await db.from('club_members').select('tag,name,club_tag').eq('is_member', true),
    'Lecture membres'
  );
  if (!members.length) throw new Error('Aucun membre : lance d abord la synchro des trophées.');

  const results = [];
  const failures = [];
  let fatal = null;
  let next = 0;

  async function worker() {
    while (!fatal) {
      const i = next++;
      if (i >= members.length) return;
      const m = members[i];
      try {
        const p = await bsGet(`/players/${encTag(m.tag)}`);
        results.push({ m, p });
      } catch (e) {
        if (e.fatal) { fatal = e; return; }
        failures.push(`${m.tag} : ${e.message}`);
      }
      await sleep(PAUSE_MS);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (fatal) throw fatal;

  const now = new Date().toISOString();
  const stateRows = [];
  const snaps = [];
  for (const { m, p } of results) {
    if (typeof p.rankedElo !== 'number') continue; // joueur sans ranked : pas de relevé
    stateRows.push({
      tag: m.tag, name: m.name,
      ranked_season_id: p.rankedSeasonId ?? null,
      ranked_rank: p.rankedRank ?? null,
      ranked_rank_name: p.rankedRankName ?? null,
      ranked_elo: p.rankedElo,
      ranked_updated_at: now,
    });
    snaps.push({
      run_id: run.id, member_tag: m.tag, club_tag: m.club_tag, taken_at: now,
      season_id: p.rankedSeasonId ?? null,
      rank_value: p.rankedRank ?? null,
      rank_name: p.rankedRankName ?? null,
      elo: p.rankedElo,
      highest_season_elo: p.highestSeasonRankedElo ?? null,
      highest_all_time_elo: p.highestAllTimeRankedElo ?? null,
    });
  }

  for (const part of chunks(stateRows)) {
    must(await db.from('club_members').upsert(part, { onConflict: 'tag' }), 'État ranked');
  }
  for (const part of chunks(snaps)) {
    must(
      await db.from('ranked_snapshots').upsert(part, { onConflict: 'run_id,member_tag', ignoreDuplicates: true }),
      'Relevés ranked'
    );
  }

  processed = results.length;
  written = snaps.length;
  const tooMany = failures.length > Math.ceil(members.length * 0.1);
  status = failures.length === 0 ? 'success' : tooMany ? 'failed' : 'partial';
  errorText = failures.length ? failures.slice(0, 20).join(' | ') : null;
  console.log(`OK : ${processed}/${members.length} profils lus, ${written} relevés ranked, ${failures.length} erreurs.`);
  if (failures.length) console.log(`::warning::Profils en erreur : ${failures.length}`);
  if (tooMany) throw new Error(`Trop d'erreurs (${failures.length}). ${errorText}`);
} catch (e) {
  status = 'failed';
  errorText = e.message;
  console.error(`::error::Échec du relevé ranked : ${e.message}`);
}

const upd = await db
  .from('sync_runs')
  .update({
    finished_at: new Date().toISOString(),
    status,
    members_processed: processed,
    snapshots_written: written,
    error: errorText ? errorText.slice(0, 1000) : null,
  })
  .eq('id', run.id);
if (upd.error) console.error(`Journal non mis à jour : ${upd.error.message}`);

process.exit(status === 'failed' ? 1 : 0);

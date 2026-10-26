// Test : affiche les champs que l'API renvoie pour un joueur (données publiques).
// Sert à vérifier si la ranked est disponible. N'écrit rien dans la base.
import { bsGet, encTag } from './bsapi.mjs';

const CLUB = process.env.PROBE_CLUB || '#822CL00PG';

const describe = (v) => (Array.isArray(v) ? `liste(${v.length})` : v === null ? 'null' : typeof v);

function findPaths(obj, path = '', out = []) {
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const p = path ? `${path}.${k}` : k;
      if (/rank|elo|power|league|ladder/i.test(k)) out.push(`${p} = ${JSON.stringify(v)?.slice(0, 80)}`);
      if (Array.isArray(v)) { if (v[0]) findPaths(v[0], `${p}[0]`, out); }
      else findPaths(v, p, out);
    }
  }
  return out;
}

try {
  const club = await bsGet(`/clubs/${encTag(CLUB)}`);
  console.log(`Club : ${club.name} | trophées ${club.trophies} | ${club.members.length} membres`);
  console.log('Champs du club :', Object.keys(club).join(', '));
  console.log('Champs d un membre de la liste :', Object.keys(club.members[0]).join(', '));

  const tag = club.members[0].tag;
  const p = await bsGet(`/players/${encTag(tag)}`);
  console.log(`\nJoueur testé : ${p.name} ${p.tag}`);
  console.log('Champs du profil :');
  for (const [k, v] of Object.entries(p)) {
    const shown = typeof v === 'object' && v !== null ? describe(v) : JSON.stringify(v);
    console.log(`  - ${k} : ${shown}`);
  }
  if (p.brawlers?.[0]) console.log('Champs d un brawler :', Object.keys(p.brawlers[0]).join(', '));
  const hits = findPaths(p);
  console.log('\nChamps contenant rank/elo/power/league :', hits.length ? '' : 'AUCUN');
  hits.slice(0, 15).forEach((h) => console.log('  ', h));

  try {
    const bl = await bsGet(`/players/${encTag(tag)}/battlelog`);
    const types = new Map();
    for (const it of bl.items || []) {
      const t = `${it.battle?.type ?? '?'}`;
      types.set(t, (types.get(t) || 0) + 1);
    }
    console.log('\nTypes de combats récents :', [...types].map(([k, n]) => `${k}×${n}`).join(', ') || 'aucun');
    const first = bl.items?.[0];
    if (first) console.log('Champs d un combat :', Object.keys(first.battle || {}).join(', '));
  } catch (e) {
    console.log('\nJournal de combats indisponible :', e.message);
  }
} catch (e) {
  console.error(`::error::${e.message}`);
  process.exit(1);
}

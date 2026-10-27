import { createClient } from '@supabase/supabase-js';
import HomeClient from './HomeClient';

export const revalidate = 300; // la page se rafraîchit toutes les 5 minutes

// ProjetX toujours en premier, puis les autres clubs dans cet ordre
const ORDER_TAGS = ['822CL00PG', 'U02RL0LQ', 'U0P2RYPQ', 'U8P2C8C2', '2G0QPVU99', '2QCGVYPLR'];
const ORDER_NAMES = ['ProjetX', 'ProjetY', 'ProjetZ', 'ProjetΣ', 'Projetψ', 'ProjetS'];
const norm = (t) => (t || '').replace('#', '').toUpperCase();

function clubRank(c) {
  const i = ORDER_TAGS.indexOf(norm(c.tag));
  if (i >= 0) return i;
  const j = ORDER_NAMES.findIndex((n) => n.toLowerCase() === (c.name || '').toLowerCase());
  return j >= 0 ? j : 99;
}

async function rows(query) {
  try {
    const { data, error } = await query;
    return error ? [] : data || [];
  } catch {
    return [];
  }
}

export default async function Page() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const empty = { clubs: [], players: [], gainsT: {}, gainsR: {}, pushT: [], pushR: [], syncAt: null };
  if (!url || !key) return <HomeClient {...empty} />;

  const db = createClient(url, key, { auth: { persistSession: false } });
  const [clubsRaw, players, gainRowsT, topT, gainRowsR, topR, sync] = await Promise.all([
    rows(db.from('clubs').select('tag,name,trophies,member_count').eq('is_active', true)),
    rows(db.from('club_members').select('tag,name,club_tag,role,trophies,ranked_elo,ranked_rank_name,ranked_rank').eq('is_member', true).order('trophies', { ascending: false }).limit(500)),
    rows(db.from('monthly_trophy_pushers').select('member_tag,gain,snapshots_count').limit(1000)),
    rows(db.from('monthly_trophy_pushers').select('member_tag,club_tag,gain').gt('gain', 0).order('gain', { ascending: false }).limit(300)),
    rows(db.from('monthly_ranked_pushers').select('member_tag,elo_gain,snapshots_count').limit(1000)),
    rows(db.from('monthly_ranked_pushers').select('member_tag,club_tag,rank_name_start,rank_name_now,elo_gain').gt('elo_gain', 0).order('elo_gain', { ascending: false }).limit(300)),
    rows(db.from('last_successful_sync').select('finished_at').limit(1)),
  ]);

  const clubs = [...clubsRaw].sort((a, b) => clubRank(a) - clubRank(b) || (b.trophies || 0) - (a.trophies || 0));

  const names = Object.fromEntries(players.map((p) => [p.tag, p.name]));
  const gainsT = {};
  for (const g of gainRowsT) if (g.snapshots_count >= 2) gainsT[g.member_tag] = g.gain;
  const gainsR = {};
  for (const g of gainRowsR) if (g.snapshots_count >= 2) gainsR[g.member_tag] = g.elo_gain;

  // Seuls les joueurs qui progressent (> 0) et qui sont encore dans un club
  const pushT = topT
    .filter((r) => names[r.member_tag])
    .map((r) => ({ tag: r.member_tag, name: names[r.member_tag], club: r.club_tag, gain: r.gain }));
  const pushR = topR
    .filter((r) => names[r.member_tag])
    .map((r) => ({ tag: r.member_tag, name: names[r.member_tag], club: r.club_tag, from: r.rank_name_start, to: r.rank_name_now, elo: r.elo_gain }));

  return <HomeClient clubs={clubs} players={players} gainsT={gainsT} gainsR={gainsR} pushT={pushT} pushR={pushR} syncAt={sync[0]?.finished_at || null} />;
}

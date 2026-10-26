import { createClient } from '@supabase/supabase-js';
import HomeClient from './HomeClient';

export const revalidate = 300; // la page se rafraîchit toutes les 5 minutes

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
  if (!url || !key) return <HomeClient clubs={[]} players={[]} gains={{}} pushT={[]} pushR={[]} syncAt={null} />;

  const db = createClient(url, key, { auth: { persistSession: false } });
  const [clubs, players, gainRows, topT, topR, sync] = await Promise.all([
    rows(db.from('clubs').select('tag,name,trophies,member_count').eq('is_active', true).order('trophies', { ascending: false })),
    rows(db.from('club_members').select('tag,name,club_tag,role,trophies').eq('is_member', true).order('trophies', { ascending: false }).limit(500)),
    rows(db.from('monthly_trophy_pushers').select('member_tag,gain,snapshots_count').limit(1000)),
    rows(db.from('monthly_trophy_pushers').select('member_tag,club_tag,gain').gt('gain', 0).order('gain', { ascending: false }).limit(5)),
    rows(db.from('monthly_ranked_pushers').select('member_tag,club_tag,rank_name_start,rank_name_now,elo_gain,rank_gain').gt('elo_gain', 0).order('elo_gain', { ascending: false }).limit(5)),
    rows(db.from('last_successful_sync').select('finished_at').limit(1)),
  ]);

  const names = Object.fromEntries(players.map((p) => [p.tag, p.name]));
  const gains = {};
  for (const g of gainRows) if (g.snapshots_count >= 2) gains[g.member_tag] = g.gain;
  const pushT = topT.map((r) => ({ tag: r.member_tag, name: names[r.member_tag] || r.member_tag, club: r.club_tag, gain: r.gain }));
  const pushR = topR.map((r) => ({
    tag: r.member_tag, name: names[r.member_tag] || r.member_tag, club: r.club_tag,
    from: r.rank_name_start, to: r.rank_name_now, elo: r.elo_gain, steps: r.rank_gain,
  }));

  return <HomeClient clubs={clubs} players={players} gains={gains} pushT={pushT} pushR={pushR} syncAt={sync[0]?.finished_at || null} />;
}

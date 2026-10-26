'use client';
import { useEffect, useMemo, useState } from 'react';

const nf = (n) => Number(n || 0).toLocaleString('fr-FR');
const rk = (s) => (s ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '');
const STALE_MS = 3 * 3600 * 1000;

export default function HomeClient({ clubs, players, gains, pushT, pushR, syncAt }) {
  const [go, setGo] = useState(false);
  const [now, setNow] = useState(null);
  const [q, setQ] = useState('');
  const [club, setClub] = useState('');
  const [limit, setLimit] = useState(30);
  const [tab, setTab] = useState('t');

  useEffect(() => { setNow(Date.now()); const t = setTimeout(() => setGo(true), 150); return () => clearTimeout(t); }, []);

  const clubName = useMemo(() => Object.fromEntries(clubs.map((c) => [c.tag, c.name])), [clubs]);
  const max = Math.max(1, ...clubs.map((c) => c.trophies || 0));
  const total = clubs.reduce((s, c) => s + (c.member_count || 0), 0);

  const ranked = useMemo(() => {
    const s = q.trim().toLowerCase();
    return players
      .map((p, i) => ({ ...p, pos: i + 1 }))
      .filter((p) => (!club || p.club_tag === club) && (!s || p.name.toLowerCase().includes(s) || p.tag.toLowerCase().includes(s)));
  }, [players, q, club]);

  const age = syncAt && now ? now - new Date(syncAt).getTime() : null;
  const stale = !syncAt || (age !== null && age > STALE_MS);
  const when = syncAt ? new Date(syncAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : null;
  const ago = age === null ? '' : age < 3600000 ? `il y a ${Math.max(1, Math.round(age / 60000))} min` : `il y a ${Math.round(age / 3600000)} h`;
  const empty = clubs.length === 0;

  return (
    <>
      <div className={`state${stale ? ' stale' : ''}`}>
        {!syncAt
          ? 'Aucune synchronisation réussie pour le moment : les données arrivent bientôt.'
          : stale
          ? `Données non à jour : dernière synchronisation réussie le ${when}.`
          : `Données à jour. Dernière synchronisation le ${when} ${ago}.`}
      </div>
      <div className="wrap">
        <header className="top">
          <a className="logo" href="#">Projet <b>X</b></a>
          <nav aria-label="Navigation principale">
            <a href="#" aria-current="page">Accueil</a>
            <a href="#clubs">Clubs</a>
            <a href="#classement">Classement</a>
            <a href="#pusheurs">Pusheurs</a>
          </nav>
        </header>

        <div className="hero">
          <div>
            <h1>{total ? `${total} joueurs.` : 'Nos joueurs.'}<span>Une seule famille.</span></h1>
            <p className="lead">Projet X réunit tous nos clubs Brawl Stars au même endroit : classements, progression des trophées et meilleurs pusheurs du mois.</p>
            <div className="cta"><a className="btn p" href="#clubs">Choisir mon club</a><a className="btn" href="#classement">Voir le classement</a></div>
          </div>
          <div className="race" aria-label="Course des clubs">
            <h2>La course des clubs</h2>
            <p>Trophées totaux par club.</p>
            {empty ? <p>Pas encore de données.</p> : clubs.map((c) => (
              <div className="row" key={c.tag}>
                <span className="n">{c.name}</span>
                <div className="track"><div className="fill" style={{ width: go ? `${((c.trophies || 0) / max) * 100}%` : 0 }} /></div>
                <span className="v">{Math.round((c.trophies || 0) / 1000)} k</span>
              </div>
            ))}
          </div>
        </div>

        <section id="clubs">
          <h2 className="t">Nos clubs</h2>
          <p className="sub">Chaque club a ses places libres. Demande à rejoindre depuis le Discord.</p>
          <div className="clubs">
            {clubs.map((c) => (
              <article className="club" key={c.tag}>
                <h3>{c.name}</h3>
                <div className="tr">{nf(c.trophies)} trophées</div>
                <div className="m"><span>{c.member_count}/30 membres</span><span>{Math.max(0, 30 - c.member_count)} libres</span></div>
                <div className="track"><div className="fill" style={{ width: `${Math.min(100, ((c.member_count || 0) / 30) * 100)}%` }} /></div>
              </article>
            ))}
          </div>
        </section>

        <section id="classement">
          <div className="two">
            <div className="card">
              <h2 className="t">Classement des joueurs</h2>
              <p className="sub">Trophées actuels et progression depuis le début du mois, d'après nos relevés.</p>
              <div className="tools">
                <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(30); }} placeholder="Rechercher un pseudo ou un tag" aria-label="Rechercher un joueur" />
                <select value={club} onChange={(e) => { setClub(e.target.value); setLimit(30); }} aria-label="Filtrer par club">
                  <option value="">Tous les clubs</option>
                  {clubs.map((c) => <option key={c.tag} value={c.tag}>{c.name}</option>)}
                </select>
              </div>
              <div className="scroll"><table>
                <thead><tr><th>#</th><th>Joueur</th><th>Club</th><th className="num">Trophées</th><th className="num">Ce mois</th></tr></thead>
                <tbody>
                  {ranked.slice(0, limit).map((p) => {
                    const g = gains[p.tag];
                    return (
                      <tr key={p.tag}>
                        <td className="pos">{p.pos}</td>
                        <td>{p.name} <span className="tag">{p.tag}</span></td>
                        <td>{clubName[p.club_tag] || ''}</td>
                        <td className="num">{nf(p.trophies)}</td>
                        <td className={`num ${g > 0 ? 'up' : g < 0 ? 'down' : ''}`}>{g === undefined ? '—' : `${g > 0 ? '+' : g < 0 ? '−' : ''}${nf(Math.abs(g))}`}</td>
                      </tr>
                    );
                  })}
                  {ranked.length === 0 && <tr><td colSpan="5">{empty ? 'Pas encore de données.' : 'Aucun joueur trouvé. Essaie un autre pseudo ou un autre club.'}</td></tr>}
                </tbody>
              </table></div>
              {ranked.length > limit && <button type="button" className="btn more" onClick={() => setLimit(limit + 30)}>Voir plus</button>}
            </div>

            <div className="card" id="pusheurs">
              <h2 className="t">Pusheurs du mois</h2>
              <p className="sub">Les plus gros progrès depuis le début du mois.</p>
              <div className="tabs" role="group" aria-label="Type de classement">
                <button type="button" aria-pressed={tab === 't'} onClick={() => setTab('t')}>Trophées</button>
                <button type="button" aria-pressed={tab === 'r'} onClick={() => setTab('r')}>Ranked</button>
              </div>
              <ul className="push">
                {tab === 't' && pushT.map((p) => (
                  <li key={p.tag}><span><b>{p.name}</b><br /><span className="tag">{clubName[p.club] || ''}</span></span><span className="big">+{nf(p.gain)}</span></li>
                ))}
                {tab === 'r' && pushR.map((p) => (
                  <li key={p.tag}><span><b>{p.name}</b><br /><span className="tag">{clubName[p.club] || ''} · {rk(p.from)} → {rk(p.to)}</span></span><span className="big">+{nf(p.elo)}</span></li>
                ))}
                {((tab === 't' && !pushT.length) || (tab === 'r' && !pushR.length)) && (
                  <li><span className="tag">Pas encore assez de relevés ce mois-ci pour calculer une progression.</span></li>
                )}
              </ul>
            </div>
          </div>
        </section>

        <section>
          <div className="join">
            <div><h2>Rejoins la famille Projet X</h2><p>Discute avec la communauté et demande une place dans un club.</p></div>
            <a className="btn p" href="https://discord.gg/GrkKPFSBX9">Rejoindre le Discord</a>
          </div>
        </section>
        <footer>© 2026 Projet X. Communauté Brawl Stars. Données issues de l'API officielle Brawl Stars.</footer>
      </div>
    </>
  );
}

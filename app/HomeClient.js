'use client';
import { useEffect, useMemo, useState } from 'react';

const nf = (n) => Number(n || 0).toLocaleString('fr-FR');
const fm = (n) => (Number(n || 0) / 1e6).toFixed(2).replace('.', ',') + 'M';
const rk = (s) => (s ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '');
const STALE_MS = 3 * 3600 * 1000;

export default function HomeClient({ clubs, players, gainsT, gainsR, pushT, pushR, syncAt }) {
  const [go, setGo] = useState(false);
  const [now, setNow] = useState(null);
  const [q, setQ] = useState('');
  const [club, setClub] = useState('');
  const [limit, setLimit] = useState(30);
  const [ct, setCt] = useState('t'); // classement : t = trophées, r = ranked
  const [pt, setPt] = useState('t'); // pusheurs : t = trophées, r = ranked
  const [plimit, setPlimit] = useState(10);

  useEffect(() => {
    setNow(Date.now());
    const t = setTimeout(() => setGo(true), 150);
    return () => clearTimeout(t);
  }, []);

  const clubName = useMemo(() => Object.fromEntries(clubs.map((c) => [c.tag, c.name])), [clubs]);
  const max = Math.max(1, ...clubs.map((c) => c.trophies || 0));
  const total = clubs.reduce((s, c) => s + (c.member_count || 0), 0);
  const first = clubs[0];

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = ct === 't'
      ? players
      : [...players].filter((p) => p.ranked_elo != null).sort((a, b) => b.ranked_elo - a.ranked_elo);
    return base
      .map((p, i) => ({ ...p, pos: i + 1 }))
      .filter((p) => (!club || p.club_tag === club) && (!s || p.name.toLowerCase().includes(s) || p.tag.toLowerCase().includes(s)));
  }, [players, q, club, ct]);

  const age = syncAt && now ? now - new Date(syncAt).getTime() : null;
  const stale = !syncAt || (age !== null && age > STALE_MS);
  const when = syncAt ? new Date(syncAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : null;
  const ago = age === null ? '' : age < 3600000 ? `il y a ${Math.max(1, Math.round(age / 60000))} min` : `il y a ${Math.round(age / 3600000)} h`;
  const empty = clubs.length === 0;

  const pushList = pt === 't' ? pushT : pushR;
  const top = pushList.slice(0, 3);
  const rest = pushList.slice(3);
  const val = (p) => (pt === 't' ? `+${nf(p.gain)}` : `+${nf(p.elo)}`);
  const unit = pt === 't' ? 'trophées' : 'élo';
  const sub = (p) => {
    const c = clubName[p.club] || '';
    if (pt === 't') return c;
    return `${c} · ${p.from && p.from !== p.to ? `${rk(p.from)} → ${rk(p.to)}` : rk(p.to)}`;
  };
  const gainCell = (g) => (g === undefined || g === 0 ? '—' : `${g > 0 ? '+' : '−'}${nf(Math.abs(g))}`);

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
          <a className="logo" href="#"><i aria-hidden="true" />Projet X</a>
          <nav aria-label="Navigation principale">
            <a href="#" aria-current="page">Accueil</a>
            <a href="#clubs">Clubs</a>
            <a href="#pusheurs">Pusheurs</a>
            <a href="#classement">Classement</a>
          </nav>
        </header>

        <div className="hero">
          <div>
            <h1>{total ? `${total} joueurs.` : 'Nos joueurs.'}<span>Une seule famille.</span></h1>
            <p className="lead">Projet X réunit tous nos clubs Brawl Stars au même endroit : classements, progression des trophées et meilleurs pusheurs du mois.</p>
            <div className="cta"><a className="btn p" href="#clubs">Choisir mon club</a><a className="btn s" href="#classement">Voir le classement</a></div>
          </div>
          {first && (
            <div className="flag">
              <div className="fl">Notre club</div>
              <div className="fn">{first.name}</div>
              <div className="fv">{nf(first.trophies)} trophées</div>
              <p>{first.member_count}/30 membres · {Math.max(0, 30 - first.member_count)} places libres</p>
              <a className="btn w" href="https://discord.gg/GrkKPFSBX9">Rejoindre {first.name}</a>
            </div>
          )}
        </div>

        <section id="clubs">
          <h2 className="t">Cap sur le sommet</h2>
          <p className="sub">Nos {clubs.length} clubs en trophées. On grimpe ensemble, et on vise toujours plus haut.</p>
          {empty ? <p className="sub">Pas encore de données.</p> : (
            <div className="range" style={{ '--n': clubs.length }}>
              <div className="peaks">
                <div className="summit"><span>Sommet</span></div>
                {clubs.map((c, i) => (
                  <div className={`col${i === 0 ? ' me' : ''}`} key={c.tag}>
                    <div className="v">{fm(c.trophies)}</div>
                    <div className="bar" style={{ height: go ? `${((c.trophies || 0) / max) * 82}%` : '0%' }} />
                  </div>
                ))}
              </div>
              <div className="names">
                {clubs.map((c, i) => (
                  <span key={c.tag}>{c.name}{i === 0 && <em className="badge">Notre club</em>}</span>
                ))}
              </div>
            </div>
          )}
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

        <section id="pusheurs">
          <h2 className="t">Pusheurs du mois</h2>
          <p className="sub">Tous les joueurs qui progressent depuis le début du mois. Le top 3 monte sur le podium.</p>
          <div className="tabs" role="group" aria-label="Type de classement des pusheurs">
            <button type="button" aria-pressed={pt === 't'} onClick={() => { setPt('t'); setPlimit(10); }}>Trophées</button>
            <button type="button" aria-pressed={pt === 'r'} onClick={() => { setPt('r'); setPlimit(10); }}>Ranked</button>
          </div>
          {top.length === 0 ? (
            <p className="empty">Personne n’a encore progressé ce mois-ci. Les premiers gains apparaissent dès la prochaine synchronisation.</p>
          ) : (
            <>
              <div className="podium">
                {top.map((p, i) => (
                  <div className={`pod p${i + 1}`} key={p.tag}>
                    <div className="rk">{i + 1}</div>
                    <b>{p.name}</b>
                    <span className="tag">{sub(p)}</span>
                    <div className="g">{val(p)} <small>{unit}</small></div>
                  </div>
                ))}
              </div>
              {rest.length > 0 && (
                <ol className="push" start={4}>
                  {rest.slice(0, plimit).map((p, i) => (
                    <li key={p.tag}>
                      <span className="pos">{i + 4}</span>
                      <span className="who"><b>{p.name}</b><span className="tag">{sub(p)}</span></span>
                      <span className="big">{val(p)}</span>
                    </li>
                  ))}
                </ol>
              )}
              {rest.length > plimit && <button type="button" className="btn s more" onClick={() => setPlimit(plimit + 20)}>Voir plus ({rest.length - plimit} autres)</button>}
            </>
          )}
        </section>

        <section id="classement">
          <div className="card">
            <h2 className="t">Classement des joueurs</h2>
            <p className="sub">{ct === 't' ? 'Trophées actuels et progression depuis le début du mois.' : 'Élo ranked actuel et progression depuis le début du mois.'}</p>
            <div className="tabs" role="group" aria-label="Type de classement">
              <button type="button" aria-pressed={ct === 't'} onClick={() => { setCt('t'); setLimit(30); }}>Trophées</button>
              <button type="button" aria-pressed={ct === 'r'} onClick={() => { setCt('r'); setLimit(30); }}>Ranked</button>
            </div>
            <div className="tools">
              <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(30); }} placeholder="Rechercher un pseudo ou un tag" aria-label="Rechercher un joueur" />
              <select value={club} onChange={(e) => { setClub(e.target.value); setLimit(30); }} aria-label="Filtrer par club">
                <option value="">Tous les clubs</option>
                {clubs.map((c) => <option key={c.tag} value={c.tag}>{c.name}</option>)}
              </select>
            </div>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Joueur</th><th>Club</th>
                    {ct === 'r' && <th>Palier</th>}
                    <th className="num">{ct === 't' ? 'Trophées' : 'Élo'}</th>
                    <th className="num">Ce mois</th>
                  </tr>
                </thead>
                <tbody>
                  {list.slice(0, limit).map((p) => {
                    const g = ct === 't' ? gainsT[p.tag] : gainsR[p.tag];
                    return (
                      <tr key={p.tag}>
                        <td className="pos">{p.pos}</td>
                        <td>{p.name} <span className="tag">{p.tag}</span></td>
                        <td>{clubName[p.club_tag] || ''}</td>
                        {ct === 'r' && <td>{rk(p.ranked_rank_name)}</td>}
                        <td className="num">{nf(ct === 't' ? p.trophies : p.ranked_elo)}</td>
                        <td className={`num ${g > 0 ? 'up' : g < 0 ? 'down' : ''}`}>{gainCell(g)}</td>
                      </tr>
                    );
                  })}
                  {list.length === 0 && (
                    <tr><td colSpan={ct === 'r' ? 6 : 5}>{empty ? 'Pas encore de données.' : 'Aucun joueur trouvé. Essaie un autre pseudo ou un autre club.'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {list.length > limit && <button type="button" className="btn s more" onClick={() => setLimit(limit + 30)}>Voir plus</button>}
          </div>
        </section>

        <section>
          <div className="join">
            <div><h2>Rejoins la famille Projet X</h2><p>Discute avec la communauté et demande une place dans un club.</p></div>
            <a className="btn w" href="https://discord.gg/GrkKPFSBX9">Rejoindre le Discord</a>
          </div>
        </section>
        <footer>© 2026 Projet X. Communauté Brawl Stars. Données issues de l’API officielle Brawl Stars.</footer>
      </div>
    </>
  );
}

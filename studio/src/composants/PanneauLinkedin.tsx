import { type FC, useEffect, useState } from 'react';
import { BRIEF_VIDE, PROFILS_LINKEDIN, type BriefLinkedin, type ProfilLinkedin } from '../../../noyau/linkedin';
import type { CiblePublication } from '../../../noyau/publication';
import type { DetailLinkedin } from '../../commun';
import { api } from '../api';
import { Attente } from './Attente';

interface Props {
  nom: string;
  cible: CiblePublication;
}

const REDACTION = 'Rédaction par Claude…';
const LIBELLES: Record<ProfilLinkedin, string> = { personnel: 'Version personnelle', cicad: 'Version CICAD' };
const QUESTIONS: { champ: keyof BriefLinkedin; libelle: string }[] = [
  { champ: 'objectif', libelle: 'Objectif (visibilité, annonce, valorisation d’équipe, prise de position, remerciement…)' },
  { champ: 'cta', libelle: 'Call-to-action (un lien, une question, aucun)' },
  { champ: 'elements', libelle: 'Éléments concrets (chiffres, outils, opérations, personnes à remercier, anecdote)' },
  { champ: 'visuel', libelle: 'Visuel (photo, capture, carrousel, vidéo ; vide : Claude en suggère un)' },
];

// Post LinkedIn d'une vidéo Pro : brief, profil choisi par l'auteur (jamais deviné), rédaction par Claude, relecture.
export const PanneauLinkedin: FC<Props> = ({ nom, cible }) => {
  const [d, setD] = useState<DetailLinkedin | null>(null);
  const [brief, setBrief] = useState<BriefLinkedin>(BRIEF_VIDE);
  const [posts, setPosts] = useState<Partial<Record<ProfilLinkedin, string>>>({});
  const [profils, setProfils] = useState<ProfilLinkedin[]>([]);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState<ProfilLinkedin | null>(null);

  const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const recevoir = (n: DetailLinkedin) => { setD(n); setBrief(n.brief); setPosts(n.posts); };
  useEffect(() => { api.linkedin(nom, cible).then(recevoir).catch(e => setErreur(message(e))); }, [nom, cible]);

  const enregistrer = async (champs: Parameters<typeof api.enregistrerLinkedin>[2]) => {
    setErreur(null);
    try { setD(await api.enregistrerLinkedin(nom, cible, champs)); } catch (e) { setErreur(message(e)); }
  };
  const rediger = async () => {
    setOccupe(true);
    setErreur(null);
    try {
      // Le brief en cours de saisie part avant la rédaction, qui le relit sur le disque.
      if (QUESTIONS.some(q => brief[q.champ] !== d?.brief[q.champ])) await api.enregistrerLinkedin(nom, cible, { brief });
      recevoir(await api.redigerLinkedin(nom, cible, profils));
    } catch (e) { setErreur(message(e)); } finally { setOccupe(false); }
  };
  if (!d) return erreur ? <p className="alerte">{erreur}</p> : null;

  const briefModifie = QUESTIONS.some(q => brief[q.champ] !== d.brief[q.champ]);
  return (
    <section className="panneau panneau-linkedin">
      <h4>Post LinkedIn</h4>
      {QUESTIONS.map(q => (
        <label key={q.champ}>
          {q.libelle}
          <textarea rows={2} value={brief[q.champ]} onChange={ev => setBrief({ ...brief, [q.champ]: ev.target.value })}
            onBlur={() => briefModifie && void enregistrer({ brief })} />
        </label>
      ))}
      <div className="profils">
        {PROFILS_LINKEDIN.map(p => (
          <label key={p}>
            <input type="checkbox" checked={profils.includes(p)}
              onChange={ev => setProfils(ev.target.checked ? [...profils, p] : profils.filter(x => x !== p))} />
            {p === 'personnel' ? 'Profil personnel' : 'Compte CICAD'}
          </label>
        ))}
      </div>
      <div className="actions">
        <button disabled={occupe || profils.length === 0} onClick={() => void rediger()}>Rédiger avec Claude</button>
        {occupe && <Attente libelle={REDACTION} />}
      </div>
      {profils.length === 0 && <p className="discret">Choisissez le ou les profils : Claude ne devine jamais lequel.</p>}
      {PROFILS_LINKEDIN.filter(p => d.posts[p] !== undefined).map(p => (
        <div key={p}>
          <label>
            {LIBELLES[p]}
            <textarea rows={14} value={posts[p] ?? ''} onChange={ev => setPosts({ ...posts, [p]: ev.target.value })}
              onBlur={() => posts[p] !== d.posts[p] && void enregistrer({ posts: { [p]: posts[p] ?? '' } })} />
          </label>
          {d.inspirations[p]?.length ? <p className="discret">Inspiré de : {d.inspirations[p]!.join(', ')}</p> : null}
          {posts[p]?.includes('[') && <p className="alerte">Le texte contient des [crochets] à vérifier.</p>}
          <button className="lien" onClick={() => void navigator.clipboard.writeText(posts[p] ?? '').then(() => setCopie(p)).catch(e => setErreur(message(e)))}>
            {copie === p ? 'Copié' : 'Copier le post'}
          </button>
        </div>
      ))}
      {erreur && <p className="alerte">{erreur}</p>}
    </section>
  );
};

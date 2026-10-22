import { type FC, useState } from 'react';
import type { Publication, VideoPubliee } from '../../../noyau/publication';
import type { ReferencesSite } from '../../serveur/site-replit';
import { api, ErreurApi } from '../api';
import { EXPLICATIONS_RELAIS } from '../logique/publication';
import { Attente } from './Attente';

interface Props {
  nom: string;
  video: VideoPubliee & { profil: 'interne' | 'mixte' };
  urlSite: string | null;
  site: ReferencesSite | null;
  changer: (c: Partial<VideoPubliee>) => void;
  synchroniser: () => Promise<void>;
  executer: (action: () => Promise<Publication>) => Promise<void>;
}

const idOuNull = (valeur: string) => (valeur === '' ? null : Number(valeur));

// Catégorie, playlist et relais d’une vidéo Interne ou Mixte sur le site ; le serveur vérifie les conditions et explique un refus.
export const PanneauSite: FC<Props> = ({ nom, video: v, urlSite, site, changer, synchroniser, executer }) => {
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [problemes, setProblemes] = useState<string[]>([]);

  // Playlists de la catégorie choisie (toutes tant qu’aucune n’est choisie).
  const playlists = site?.playlists.filter(p => v.replit.categorieId === null || p.categorieId === v.replit.categorieId) ?? [];

  const relayer = async () => {
    setOccupe(true);
    setErreur(null);
    setProblemes([]);
    try {
      await synchroniser();
      await executer(() => api.relayer(nom, v.cible));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      if (e instanceof ErreurApi) setProblemes(e.problemes);
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="site">
      <h4>Replit</h4>
      <p className="discret">{EXPLICATIONS_RELAIS[v.profil]}</p>
      {site ? (
        <div className="actions">
          <label>
            Catégorie{' '}
            <select
              value={v.replit.categorieId ?? ''}
              onChange={e => changer({ replit: { ...v.replit, categorieId: idOuNull(e.target.value), playlistId: null } })}
            >
              <option value="">—</option>
              {site.categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </label>
          <label>
            Playlist{' '}
            <select value={v.replit.playlistId ?? ''} onChange={e => changer({ replit: { ...v.replit, playlistId: idOuNull(e.target.value) } })}>
              <option value="">— aucune —</option>
              {playlists.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </label>
        </div>
      ) : (
        <p className="alerte">Site injoignable : catégories et playlists indisponibles, relais impossible pour l’instant.</p>
      )}
      <div className="actions">
        <button className="principal" disabled={occupe} onClick={() => void relayer()}>
          {v.replit.id ? 'Mettre à jour sur le site' : 'Relayer sur le site'}
        </button>
        {v.replit.id && urlSite && (
          <a href={`${urlSite.replace(/\/+$/, '')}/video/${v.replit.id}`} target="_blank" rel="noreferrer">Voir sur le site</a>
        )}
      </div>
      {occupe && (
        <p><Attente libelle={`Relais en cours…${v.profil === 'interne' ? ' L’envoi du fichier vidéo peut prendre plusieurs minutes.' : ''}`} /></p>
      )}
      {erreur && <p className="alerte">{erreur}</p>}
      {problemes.length > 0 && <ul>{problemes.map(p => <li key={p}>{p}</li>)}</ul>}
    </div>
  );
};

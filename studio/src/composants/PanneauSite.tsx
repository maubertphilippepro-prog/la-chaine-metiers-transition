import { type FC, useState } from 'react';
import { retraitAFaire, type Publication, type VideoPubliee } from '../../../noyau/publication';
import { diffusion } from '../../../noyau/qualification';
import type { ReferencesSite } from '../../serveur/site-replit';
import { api, ErreurApi } from '../api';
import { EXPLICATION_RETRAIT, EXPLICATIONS_RELAIS } from '../logique/publication';
import { Attente } from './Attente';

interface Props {
  nom: string;
  video: VideoPubliee;
  urlSite: string | null;
  site: ReferencesSite | null;
  changer: (c: Partial<VideoPubliee>) => void;
  synchroniser: () => Promise<void>;
  executer: (action: () => Promise<Publication>) => Promise<void>;
}

const idOuNull = (valeur: string) => (valeur === '' ? null : Number(valeur));

// Relais d’une vidéo Pro sur le site (catégorie, playlist), ou retrait d’une vidéo passée en Perso ; le serveur vérifie et explique un refus.
export const PanneauSite: FC<Props> = ({ nom, video: v, urlSite, site, changer, synchroniser, executer }) => {
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [problemes, setProblemes] = useState<string[]>([]);

  // Playlists de la catégorie choisie (toutes tant qu’aucune n’est choisie).
  const playlists = site?.playlists.filter(p => v.replit.categorieId === null || p.categorieId === v.replit.categorieId) ?? [];

  const agir = async (action: () => Promise<Publication>) => {
    setOccupe(true);
    setErreur(null);
    setProblemes([]);
    try {
      await synchroniser();
      await executer(action);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      if (e instanceof ErreurApi) setProblemes(e.problemes);
    } finally {
      setOccupe(false);
    }
  };
  const relayer = () => agir(() => api.relayer(nom, v.cible));
  const retirer = () => agir(() => api.retirerDuSite(nom, v.cible, { nature: v.nature, confidentielle: v.confidentielle }));

  const formeSite = diffusion(v).site;
  const lienSite = v.replit.id && urlSite
    ? <a href={`${urlSite.replace(/\/+$/, '')}/video/${v.replit.id}`} target="_blank" rel="noreferrer">Voir sur le site</a>
    : null;
  const retour = (
    <>
      {erreur && <p className="alerte">{erreur}</p>}
      {problemes.length > 0 && <ul>{problemes.map(p => <li key={p}>{p}</li>)}</ul>}
    </>
  );

  if (retraitAFaire(v)) {
    return (
      <div className="site">
        <h4>Replit</h4>
        <p className="alerte">{EXPLICATION_RETRAIT}</p>
        <div className="actions">
          <button className="principal" disabled={occupe} onClick={() => void retirer()}>Retirer du site</button>
          {lienSite}
        </div>
        {occupe && <p><Attente libelle="Retrait du site…" /></p>}
        {retour}
      </div>
    );
  }

  return (
    <div className="site">
      <h4>Replit</h4>
      {formeSite !== 'aucun' && <p className="discret">{EXPLICATIONS_RELAIS[formeSite]}</p>}
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
        {lienSite}
      </div>
      {occupe && (
        <p><Attente libelle={`Relais en cours…${formeSite === 'fichier' ? ' L’envoi du fichier vidéo peut prendre plusieurs minutes.' : ''}`} /></p>
      )}
      {retour}
    </div>
  );
};

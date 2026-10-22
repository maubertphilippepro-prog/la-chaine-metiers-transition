import { type FC, useState } from 'react';
import type { Publication, VideoPubliee } from '../../../noyau/publication';
import { api, ErreurApi } from '../api';
import { EXPLICATIONS_RELAIS } from '../logique/publication';

interface Props {
  nom: string;
  video: VideoPubliee & { profil: 'interne' | 'mixte' };
  urlSite: string | null;
  synchroniser: () => Promise<void>;
  executer: (action: () => Promise<Publication>) => Promise<void>;
}

// Relais d’une vidéo Interne ou Mixte sur le site ; le serveur vérifie les conditions et explique un refus.
export const PanneauSite: FC<Props> = ({ nom, video: v, urlSite, synchroniser, executer }) => {
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [problemes, setProblemes] = useState<string[]>([]);

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
      <h4>Site</h4>
      <p className="discret">{EXPLICATIONS_RELAIS[v.profil]}</p>
      <div className="actions">
        <button className="principal" disabled={occupe} onClick={() => void relayer()}>
          {v.replit.id ? 'Mettre à jour sur le site' : 'Relayer sur le site'}
        </button>
        {v.replit.id && urlSite && (
          <a href={`${urlSite.replace(/\/+$/, '')}/video/${v.replit.id}`} target="_blank" rel="noreferrer">Voir sur le site</a>
        )}
      </div>
      {occupe && (
        <p className="discret">
          Relais en cours…{v.profil === 'interne' && ' L’envoi du fichier vidéo peut prendre plusieurs minutes.'}
        </p>
      )}
      {erreur && <p className="alerte">{erreur}</p>}
      {problemes.length > 0 && <ul>{problemes.map(p => <li key={p}>{p}</li>)}</ul>}
    </div>
  );
};

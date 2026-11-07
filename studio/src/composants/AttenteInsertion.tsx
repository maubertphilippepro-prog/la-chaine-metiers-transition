import { type FC, useEffect, useRef, useState } from 'react';
import type { EtatInsertion } from '../../commun';
import { api } from '../api';
import { LIBELLES_INSERTION } from '../logique/rush';
import { Attente } from './Attente';

const INTERVALLE_MS = 2000;

// Remplace l'écran de montage pendant l'insertion d'un rush : aucune modification n'est possible.
export const AttenteInsertion: FC<{ nom: string; onFin: (e: EtatInsertion) => void }> = ({ nom, onFin }) => {
  const [etat, setEtat] = useState<EtatInsertion | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const fin = useRef(onFin);
  fin.current = onFin;

  useEffect(() => {
    let actif = true;
    let minuterie: number | undefined;
    const suivre = async () => {
      try {
        const e = await api.etatInsertion(nom);
        if (!actif) return;
        setErreur(null);
        if (!e.enCours) {
          fin.current(e);
          return;
        }
        setEtat(e);
      } catch (e) {
        if (!actif) return;
        setErreur((e as Error).message);
      }
      minuterie = window.setTimeout(() => void suivre(), INTERVALLE_MS);
    };
    void suivre();
    return () => {
      actif = false;
      window.clearTimeout(minuterie);
    };
  }, [nom]);

  return (
    <div className="page">
      <h1>Insertion d’un rush</h1>
      <p><Attente libelle={etat?.etape ? LIBELLES_INSERTION[etat.etape] : 'Lancement…'} /></p>
      <p className="discret">Le montage sera rechargé à la fin. Aucune modification n’est possible pendant ce temps.</p>
      {erreur && <p className="alerte">{erreur}</p>}
    </div>
  );
};

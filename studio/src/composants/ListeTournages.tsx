import { type FC, useCallback, useEffect, useState } from 'react';
import type { ResumeTournage } from '../../commun';
import { api } from '../api';
import { LigneTournage } from './LigneTournage';
import { NouveauTournage } from './NouveauTournage';

const RAFRAICHISSEMENT_MS = 3000;

export const ListeTournages: FC = () => {
  const [tournages, setTournages] = useState<ResumeTournage[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [lancement, setLancement] = useState(false);

  const charger = useCallback(() => {
    api.tournages().then(t => { setTournages(t); setErreur(null); }, (e: Error) => setErreur(e.message));
  }, []);
  useEffect(charger, [charger]);

  const analyseEnCours = tournages?.some(t => t.analyseEnCours) ?? false;
  useEffect(() => {
    if (!analyseEnCours) return;
    const minuterie = setInterval(charger, RAFRAICHISSEMENT_MS);
    return () => clearInterval(minuterie);
  }, [analyseEnCours, charger]);

  // Une vidéo lâchée à côté de la zone de dépôt ne doit pas faire quitter le studio.
  useEffect(() => {
    const empecher = (e: Event) => e.preventDefault();
    window.addEventListener('dragover', empecher);
    window.addEventListener('drop', empecher);
    return () => {
      window.removeEventListener('dragover', empecher);
      window.removeEventListener('drop', empecher);
    };
  }, []);

  async function analyser(nom: string, titre: string) {
    setErreur(null);
    setLancement(true);
    try {
      await api.analyser(nom, titre);
      charger();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setLancement(false);
    }
  }

  const bloque = analyseEnCours || lancement;

  return (
    <div className="page">
      <h1>Tournages</h1>
      <div className="actions">
        <button className="principal" onClick={() => setNouveau(true)} disabled={nouveau}>Nouveau tournage</button>
      </div>
      {nouveau && <NouveauTournage onFermer={() => setNouveau(false)} onChangement={charger} />}
      {erreur && <p className="alerte">{erreur}</p>}
      {tournages?.length === 0 && <p>Aucun tournage dans donnees/tournages/.</p>}
      {tournages && tournages.length > 0 && (
        <table className="liste">
          <thead>
            <tr><th>Tournage</th><th>Statut</th><th>Message</th></tr>
          </thead>
          <tbody>
            {tournages.map(t => (
              <LigneTournage key={t.nom} t={t} bloque={bloque} onAnalyser={analyser} onChangement={charger} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

import { type FC, useEffect, useMemo, useState } from 'react';
import type { Consigne } from '../../../noyau/consignes';
import type { Analyse, Montage } from '../../../noyau/types';
import { verifierAvantRendu, type ReglagesRendu } from '../../../noyau/verifications';
import type { Cible } from '../../../remotion/scripts/rendu';
import type { EtatRendu } from '../../commun';
import { api, ErreurApi } from '../api';
import { cibleDuFichier } from '../logique/rendu';
import type { EtatEnregistrement } from '../useMontage';

interface Props {
  nom: string;
  analyse: Analyse;
  montage: Montage;
  reglages: ReglagesRendu;
  consignes: Consigne[];
  enregistrement: EtatEnregistrement;
}

const INTERVALLE_SUIVI = 1000;

// Vérifications, puis rendu de la vidéo complète et de chaque épisode avec suivi ; relance d'un rendu en échec.
export const PanneauRendu: FC<Props> = ({ nom, analyse, montage, reglages, consignes, enregistrement }) => {
  const [etat, setEtat] = useState<EtatRendu | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [problemesServeur, setProblemesServeur] = useState<string[]>([]);
  const problemes = useMemo(
    () => verifierAvantRendu(analyse, montage, reglages, consignes),
    [analyse, montage, reglages, consignes],
  );
  const enCours = etat?.enCours ?? false;

  useEffect(() => {
    api.etatRendu().then(setEtat, () => undefined);
  }, []);
  useEffect(() => {
    if (!enCours) return;
    const minuteur = window.setInterval(() => api.etatRendu().then(setEtat, () => undefined), INTERVALLE_SUIVI);
    return () => window.clearInterval(minuteur);
  }, [enCours]);

  const lancer = async (cible: Cible) => {
    setErreur(null);
    setProblemesServeur([]);
    try {
      // Le serveur rend montage.json : on s'assure qu'il contient la dernière version.
      await api.enregistrer(nom, montage);
      setEtat(await api.rendre(nom, cible));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      if (e instanceof ErreurApi) setProblemesServeur(e.problemes);
    }
  };

  const ici = etat?.nom === nom ? etat : null;
  return (
    <section className="panneau">
      <h3>Rendu</h3>
      {problemes.length > 0 && (
        <>
          <p className="discret">À régler avant le rendu :</p>
          <ul>{problemes.map(p => <li key={p}>{p}</li>)}</ul>
        </>
      )}
      <button
        className="principal"
        disabled={problemes.length > 0 || enCours || enregistrement === 'en-attente'}
        onClick={() => void lancer('tout')}
      >
        Valider et lancer le rendu
      </button>
      {enCours && !ici && <p className="discret">Rendu en cours pour « {etat?.nom} ».</p>}
      {erreur && <p className="alerte">{erreur}</p>}
      {problemesServeur.length > 0 && <ul>{problemesServeur.map(p => <li key={p}>{p}</li>)}</ul>}
      {ici?.enCours && (
        <p>
          {ici.fichier ?? 'Préparation…'} : {Math.round(ici.progression * 100)} %
        </p>
      )}
      {ici?.erreur && <p className="alerte">{ici.erreur}</p>}
      {ici && !ici.enCours && ici.resultats.map(r => {
        const cible = cibleDuFichier(r.fichier);
        return (
          <div key={r.fichier} className="actions">
            <span className={r.ok ? '' : 'trop-long'}>{r.ok ? '✓' : '✗'} {r.fichier}{r.message ? ` : ${r.message}` : ''}</span>
            {!r.ok && cible !== null && <button onClick={() => void lancer(cible)}>Relancer</button>}
          </div>
        );
      })}
      {ici && !ici.enCours && ici.resultats.length > 0 && (
        <p className="discret">Fichiers dans donnees/tournages/{nom}/rendus/ (journal : journal.txt).</p>
      )}
    </section>
  );
};

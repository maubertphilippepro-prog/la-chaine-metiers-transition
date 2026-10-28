import { type FC, useEffect, useMemo, useRef, useState } from 'react';
import type { Consigne } from '../../../noyau/consignes';
import type { Analyse, Montage } from '../../../noyau/types';
import { verifierAvantRendu, type ReglagesRendu } from '../../../noyau/verifications';
import type { Cible, Video } from '../../../remotion/scripts/rendu';
import type { EtatRendu } from '../../commun';
import { api, ErreurApi } from '../api';
import { cibleDeSelection, cibleDuFichier } from '../logique/rendu';
import type { EtatEnregistrement } from '../useMontage';
import { Attente } from './Attente';

interface Props {
  nom: string;
  analyse: Analyse;
  montage: Montage;
  reglages: ReglagesRendu;
  consignes: Consigne[];
  enregistrement: EtatEnregistrement;
  titresEpisodes: string[];
  // Appelé quand un rendu de ce tournage lancé ou suivi ici se termine sans échec.
  onTermine: () => void;
}

const INTERVALLE_SUIVI = 1000;

// Vérifications, puis rendu des vidéos cochées (vidéo complète, épisodes) avec suivi ; relance d'un rendu en échec.
export const PanneauRendu: FC<Props> = ({ nom, analyse, montage, reglages, consignes, enregistrement, titresEpisodes, onTermine }) => {
  const [etat, setEtat] = useState<EtatRendu | null>(null);
  const [ecartees, setEcartees] = useState<Video[]>([]);
  const videos: { video: Video; libelle: string }[] = [
    { video: 'complete', libelle: 'Vidéo complète' },
    ...titresEpisodes.map((titre, i) => ({ video: i + 1, libelle: `Épisode ${i + 1} : ${titre || 'sans titre'}` })),
  ];
  const cible = cibleDeSelection(videos.map(v => v.video), ecartees);
  const [erreur, setErreur] = useState<string | null>(null);
  const [problemesServeur, setProblemesServeur] = useState<string[]>([]);
  const problemes = useMemo(
    () => verifierAvantRendu(analyse, montage, reglages, consignes),
    [analyse, montage, reglages, consignes],
  );
  const enCours = etat?.enCours ?? false;
  const ici = etat?.nom === nom ? etat : null;
  // Fin d'un rendu vu en cours ici : un état déjà terminé au chargement ne compte pas.
  const vuEnCours = useRef(false);
  useEffect(() => {
    if (ici?.enCours) vuEnCours.current = true;
    else if (ici && vuEnCours.current) {
      vuEnCours.current = false;
      if (!ici.erreur && ici.resultats.length > 0 && ici.resultats.every(r => r.ok)) onTermine();
    }
  }, [ici, onTermine]);

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

  const basculer = (video: Video) =>
    setEcartees(e => (e.includes(video) ? e.filter(v => v !== video) : [...e, video]));
  return (
    <section className="panneau">
      <h3>Rendu</h3>
      {problemes.length > 0 && (
        <>
          <p className="discret">À régler avant le rendu :</p>
          <ul>{problemes.map(p => <li key={p}>{p}</li>)}</ul>
        </>
      )}
      <p className="discret">Vidéos à rendre :</p>
      {videos.map(({ video, libelle }) => (
        <label key={video} className="actions">
          <input type="checkbox" checked={!ecartees.includes(video)} disabled={enCours} onChange={() => basculer(video)} />
          {libelle}
        </label>
      ))}
      <button
        className="principal"
        disabled={problemes.length > 0 || enCours || enregistrement === 'en-attente' || cible === null}
        onClick={() => { if (cible !== null) void lancer(cible); }}
      >
        Valider et lancer le rendu
      </button>
      {enCours && !ici && <p><Attente libelle={`Rendu en cours pour « ${etat?.nom ?? ''} ».`} /></p>}
      {erreur && <p className="alerte">{erreur}</p>}
      {problemesServeur.length > 0 && <ul>{problemesServeur.map(p => <li key={p}>{p}</li>)}</ul>}
      {ici?.enCours && (ici.fichier
        ? <p>{ici.fichier} : {Math.round(ici.progression * 100)} %</p>
        : <p><Attente libelle="Préparation du rendu…" /></p>)}
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

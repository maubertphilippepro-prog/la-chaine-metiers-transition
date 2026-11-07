import { type FC, useRef, useState } from 'react';
import { EXTENSIONS_VIDEO } from '../../commun';
import { raisonFichierVideo } from '../logique/nouveau-tournage';
import { Attente } from './Attente';

interface Props {
  rappel: string;
  publicationEngagee: boolean;
  // Enregistre le montage, envoie le rush puis lance l'insertion ; l'écran d'attente prend ensuite le relais.
  inserer: (fichier: File, titre: string, onProgression: (part: number) => void) => Promise<void>;
  onAnnuler: () => void;
}

// Petit formulaire de la barre de sélection : fichier du rush (choisi ou glissé) et titre de son chapitre.
export const FormulaireRush: FC<Props> = ({ rappel, publicationEngagee, inserer, onAnnuler }) => {
  const [video, setVideo] = useState<File | null>(null);
  const [titre, setTitre] = useState('Nouveau chapitre');
  const [depot, setDepot] = useState(false);
  const [progression, setProgression] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const choix = useRef<HTMLInputElement>(null);
  const enCours = progression !== null;

  function choisir(fichiers: File[]) {
    const f = fichiers[0];
    if (!f || enCours) return;
    const raison = raisonFichierVideo(f.name);
    setErreur(raison);
    setVideo(raison ? null : f);
  }

  async function lancer() {
    if (!video) return;
    setErreur(null);
    setProgression(0);
    try {
      await inserer(video, titre.trim(), setProgression);
    } catch (e) {
      setErreur((e as Error).message);
      setProgression(null);
    }
  }

  return (
    <span
      className={depot ? 'depot actif' : 'depot'}
      onDragOver={e => { e.preventDefault(); setDepot(true); }}
      onDragLeave={() => setDepot(false)}
      onDrop={e => { e.preventDefault(); setDepot(false); choisir([...e.dataTransfer.files]); }}
    >
      {video ? <strong>{video.name}</strong> : 'Glissez ici le rush'}
      {' '}
      <button onClick={() => choix.current?.click()} disabled={enCours}>Choisir un fichier</button>
      <input
        ref={choix}
        type="file"
        accept={EXTENSIONS_VIDEO.join(',')}
        hidden
        onChange={e => { choisir([...(e.target.files ?? [])]); e.target.value = ''; }}
      />
      <input value={titre} onChange={e => setTitre(e.target.value)} aria-label="Titre du chapitre du rush" disabled={enCours} size={30} />
      <span className="discret">{rappel}</span>
      {publicationEngagee && (
        <span className="trop-long">Une vidéo de ce tournage est déjà prête ou envoyée : sa publication devra être refaite.</span>
      )}
      {progression !== null && progression < 1 && (
        <span><progress value={progression} max={1} /> Envoi du rush : {Math.round(progression * 100)} %</span>
      )}
      {progression === 1 && <Attente libelle="Lancement de l’insertion…" />}
      {erreur && <span className="alerte">{erreur}</span>}
      <button className="principal" onClick={() => void lancer()} disabled={!video || enCours}>Insérer</button>
      <button onClick={onAnnuler} disabled={enCours}>Annuler</button>
    </span>
  );
};

import { type FC, useRef, useState } from 'react';
import { EXTENSIONS_VIDEO } from '../../commun';
import { api } from '../api';
import { aujourdhui, raisonFichierVideo } from '../logique/nouveau-tournage';
import { Attente } from './Attente';

// Encadré « Nouveau tournage » : crée le dossier, envoie la vidéo dans bruts/ puis lance l'analyse.
export const NouveauTournage: FC<{ onFermer: () => void; onChangement: () => void }> = ({ onFermer, onChangement }) => {
  const [video, setVideo] = useState<File | null>(null);
  const [titre, setTitre] = useState('');
  const [date, setDate] = useState(() => aujourdhui());
  const [depot, setDepot] = useState(false);
  const [progression, setProgression] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // Étapes déjà faites, gardées pour reprendre après un échec.
  const [cree, setCree] = useState<{ nom: string; videoEnvoyee: boolean } | null>(null);
  const choix = useRef<HTMLInputElement>(null);
  const enCours = progression !== null;

  function choisir(fichiers: File[]) {
    const f = fichiers[0];
    if (!f || enCours || cree?.videoEnvoyee) return;
    const raison = raisonFichierVideo(f.name);
    setErreur(raison);
    setVideo(raison ? null : f);
  }

  async function creer() {
    if (!video) return;
    setErreur(null);
    setProgression(cree?.videoEnvoyee ? 1 : 0);
    try {
      let etat = cree;
      if (!etat) {
        etat = { nom: (await api.creerTournage(titre.trim(), date)).nom, videoEnvoyee: false };
        setCree(etat);
      }
      if (!etat.videoEnvoyee) {
        await api.deposerVideo(etat.nom, video, setProgression);
        etat = { ...etat, videoEnvoyee: true };
        setCree(etat);
      }
      await api.analyser(etat.nom, titre.trim());
      onChangement();
      onFermer();
    } catch (e) {
      setErreur((e as Error).message);
      setProgression(null);
      onChangement();
    }
  }

  return (
    <div
      className="encadre"
      // Une vidéo lâchée à côté de la zone ne doit pas faire quitter le studio.
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); choisir([...e.dataTransfer.files]); }}
    >
      <h2>Nouveau tournage</h2>
      <div
        className={depot ? 'depot actif' : 'depot'}
        onDragOver={e => { e.preventDefault(); setDepot(true); }}
        onDragLeave={() => setDepot(false)}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); setDepot(false); choisir([...e.dataTransfer.files]); }}
      >
        {video ? <strong>{video.name}</strong> : 'Glissez ici la vidéo exportée de Clipchamp'}
        {' '}
        <button onClick={() => choix.current?.click()} disabled={enCours || cree?.videoEnvoyee}>Choisir un fichier</button>
        <input
          ref={choix}
          type="file"
          accept={EXTENSIONS_VIDEO.join(',')}
          hidden
          onChange={e => { choisir([...(e.target.files ?? [])]); e.target.value = ''; }}
        />
      </div>
      <div className="champs">
        <label>
          Titre <input value={titre} onChange={e => setTitre(e.target.value)} disabled={enCours} size={50} />
        </label>
        <label>
          Date <input type="date" value={date} onChange={e => setDate(e.target.value)} disabled={enCours || cree !== null} />
        </label>
      </div>
      {progression !== null && progression < 1 && (
        <p><progress value={progression} max={1} /> Envoi de la vidéo : {Math.round(progression * 100)} %</p>
      )}
      {progression === 1 && <p><Attente libelle="Lancement de l’analyse…" /></p>}
      {erreur && <p className="alerte">{erreur}</p>}
      <div className="actions">
        <button className="principal" onClick={() => void creer()} disabled={!video || !titre.trim() || !date || enCours}>
          Créer et analyser
        </button>
        <button onClick={onFermer} disabled={enCours}>Fermer</button>
      </div>
    </div>
  );
};

import { Thumbnail } from '@remotion/player';
import { type FC, useState } from 'react';
import { cleVignette, urlsVignette, type Publication, type Vignette, type VideoPubliee } from '../../../noyau/publication';
import { HAUTEUR_VIGNETTE, LARGEUR_VIGNETTE, Vignette as CompositionVignette } from '../../../remotion/composants/Vignette';
import type { DetailPublication, Pose } from '../../commun';
import { api } from '../api';
import { baseVignette } from '../logique/publication';
import { Attente } from './Attente';

export const RENDU_VIGNETTE = 'Rendu de la vignette…';

interface Props {
  nom: string;
  video: VideoPubliee;
  detail: DetailPublication;
  poses: Pose[];
  // Vignette de la vidéo complète : pose et fond de départ des épisodes.
  complete: Vignette | null;
  // Instant affiché dans le lecteur de l'écran, en secondes de la source.
  instant: () => number;
  changer: (c: Partial<VideoPubliee>) => void;
  lancer: (libelle: string, action: () => Promise<Publication>) => Promise<void>;
  // Libellé de l’action en cours sur la carte, null si aucune.
  occupe: string | null;
}

const arrondi = (t: number) => Math.round(t * 1000) / 1000;

// Pose (banque ou caméra), fond (charte ou écran), accroche ; aperçu immédiat, puis rendu en JPEG par le serveur.
export const ChoixVignette: FC<Props> = ({ nom, video: v, detail, poses, complete, instant, changer, lancer, occupe }) => {
  const [erreur, setErreur] = useState<string | null>(null);
  const [extraction, setExtraction] = useState(false);
  // Repère du dernier rendu : un nouveau rendu de la même vignette (logo ou charte changés) garde le même nom de fichier,
  // le navigateur réafficherait sinon l’ancienne image.
  const [tirage, setTirage] = useState(() => Date.now());
  const vignette = v.vignette;
  const bases = { tournage: detail.urlTournage, poses: detail.urlPoses };

  const composer = (c: Partial<Omit<Vignette, 'fichier'>>) => {
    const base = baseVignette(vignette, complete, poses[0]?.fichier);
    const pose = c.pose ?? base.pose;
    if (!pose) {
      setErreur('Aucune pose : ajoutez des photos dans donnees/poses/ ou utilisez la caméra séparée.');
      return;
    }
    setErreur(null);
    changer({
      vignette: {
        pose,
        fond: c.fond ?? base.fond,
        accroche: c.accroche ?? vignette?.accroche ?? v.accroches[0] ?? '',
        fichier: vignette?.fichier ?? null,
      },
    });
  };

  const prendre = async (source: 'ecran' | 'camera') => {
    const t = arrondi(instant());
    setExtraction(true);
    setErreur(null);
    try {
      await api.image(nom, source, t);
      composer(source === 'ecran' ? { fond: { source: 'ecran', instant: t } } : { pose: { source: 'camera', instant: t } });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setExtraction(false);
    }
  };

  const urls = vignette ? urlsVignette(vignette, bases) : null;  return (
    <fieldset className="vignette">
      <legend>Vignette</legend>
      <div className="actions">
        <span>Pose :</span>
        {poses.map(p => (
          <button
            key={p.fichier}
            className={vignette?.pose.source === 'banque' && vignette.pose.fichier === p.fichier ? 'pose choisie' : 'pose'}
            title={p.fichier}
            onClick={() => composer({ pose: { source: 'banque', fichier: p.fichier } })}
          >
            <img src={p.url} alt={p.fichier} />
          </button>
        ))}
        {detail.camera && (
          <button disabled={extraction} onClick={() => void prendre('camera')}>Caméra à l’image affichée</button>
        )}
      </div>
      <div className="actions">
        <span>Fond :</span>
        <button onClick={() => composer({ fond: { source: 'charte' } })}>Formes de la charte</button>
        <button disabled={extraction} onClick={() => void prendre('ecran')}>Écran à l’image affichée</button>
      </div>
      <label>
        Accroche (3 à 5 mots)
        <input value={vignette?.accroche ?? ''} onChange={e => composer({ accroche: e.target.value })} />
      </label>
      {v.accroches.length > 0 && (
        <div className="actions">
          <span className="discret">Accroches proposées :</span>
          {v.accroches.map(a => (
            <button key={a} className={a === vignette?.accroche ? 'choisi' : undefined} onClick={() => composer({ accroche: a })}>{a}</button>
          ))}
        </div>
      )}
      {extraction && <p><Attente libelle="Extraction de l’image…" /></p>}
      {erreur && <p className="alerte">{erreur}</p>}
      {vignette && urls && (
        <div className="apercus-vignette">
          <div>
            <p className="discret">Aperçu</p>
            <Thumbnail
              component={CompositionVignette}
              compositionWidth={LARGEUR_VIGNETTE}
              compositionHeight={HAUTEUR_VIGNETTE}
              frameToDisplay={0}
              durationInFrames={1}
              fps={30}
              inputProps={{ fondUrl: urls.fond, poseUrl: urls.pose, accroche: vignette.accroche }}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <p className="discret">Rendu</p>
            {occupe === RENDU_VIGNETTE
              ? <div className="rendu-en-cours"><Attente libelle={RENDU_VIGNETTE} /></div>
              : vignette.fichier
                ? <img className="vignette-rendue" src={`${detail.urlTournage}/${vignette.fichier}?v=${encodeURIComponent(cleVignette(vignette))}&t=${tirage}`} alt="Vignette rendue" />
                : <p className="discret">Pas encore rendue.</p>}
          </div>
        </div>
      )}
      {vignette && (
        <>
          <div className="actions">
            <button disabled={!!occupe} onClick={() => void lancer(RENDU_VIGNETTE, async () => {
              const p = await api.rendreVignette(nom, v.cible);
              setTirage(Date.now());
              return p;
            })}>Rendre la vignette</button>
            {occupe === RENDU_VIGNETTE && <Attente libelle={RENDU_VIGNETTE} />}
          </div>
          <p className="discret">
            L’aperçu est calculé par le navigateur ; le rendu fabrique le fichier JPEG 1280×720 qui sera téléversé sur YouTube.
            À refaire après chaque changement de pose, de fond ou d’accroche, avant de valider.
          </p>
        </>
      )}
    </fieldset>
  );
};

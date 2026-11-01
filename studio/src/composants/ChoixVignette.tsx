import { Thumbnail } from '@remotion/player';
import { type FC, useEffect, useState } from 'react';
import { cleVignette, proprietesVignette, type Publication, type Vignette, type VideoPubliee } from '../../../noyau/publication';
import { HAUTEUR_VIGNETTE, LARGEUR_VIGNETTE, Vignette as CompositionVignette } from '../../../remotion/composants/Vignette';
import type { DetailPublication, Pose } from '../../commun';
import { api } from '../api';
import { Attente } from './Attente';
import { FormulaireVignette } from './FormulaireVignette';

export const RENDU_VIGNETTE = 'Rendu de la vignette…';

interface Props {
  nom: string;
  video: VideoPubliee;
  detail: DetailPublication;
  poses: Pose[];
  // Vignette de la vidéo complète : pose de départ des épisodes.
  complete: Vignette | null;
  changer: (c: Partial<VideoPubliee>) => void;
  lancer: (libelle: string, action: () => Promise<Publication>) => Promise<void>;
  // Libellé de l’action en cours sur la carte, null si aucune.
  occupe: string | null;
}

// Captures du tournage, formulaire de génération par Claude, aperçu immédiat, puis rendu en JPEG par le serveur.
export const ChoixVignette: FC<Props> = ({ nom, video: v, detail, poses, complete, changer, lancer, occupe }) => {
  const [erreur, setErreur] = useState<string | null>(null);
  // Repère du dernier rendu : un nouveau rendu de la même vignette (logo ou charte changés) garde le même nom de fichier,
  // le navigateur réafficherait sinon l’ancienne image.
  const [tirage, setTirage] = useState(() => Date.now());
  const [captures, setCaptures] = useState(detail.captures);
  // Suit le détail quand il est rechargé (nouvelle capture vue par le serveur).
  useEffect(() => setCaptures(detail.captures), [detail.captures]);
  const [depot, setDepot] = useState(false);
  const vignette = v.vignette;
  const bases = { tournage: detail.urlTournage, poses: detail.urlPoses, logos: detail.urlLogos };

  const deposer = async (fichiers: File[]) => {
    setErreur(null);
    for (const f of fichiers) {
      try {
        setCaptures((await api.deposerCapture(nom, f.name, f)).captures);
      } catch (e) {
        setErreur(`${f.name} : ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }
  };
  const actualiser = async () => {
    try {
      setCaptures(await api.captures(nom));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <fieldset className="vignette">
      <legend>Vignette</legend>
      {poses.length === 0 && <p className="alerte">Aucune pose : ajoutez des photos dans donnees/poses/.</p>}
      <div className="actions">
        <span className="discret">{captures.length} capture(s) dans captures/ du tournage.</span>
        <button onClick={() => void actualiser()}>Actualiser</button>
      </div>
      <div
        className={depot ? 'depot actif' : 'depot'}
        onDragOver={e => { e.preventDefault(); setDepot(true); }}
        onDragLeave={() => setDepot(false)}
        onDrop={e => { e.preventDefault(); setDepot(false); void deposer([...e.dataTransfer.files]); }}
      >
        Glissez ici des captures (PNG, JPEG ou SVG), ou déposez-les dans captures/ du tournage puis « Actualiser ».
      </div>
      <FormulaireVignette nom={nom} video={v} detail={detail} poses={poses} captures={captures} complete={complete} bases={bases} changer={changer} lancer={lancer} occupe={occupe} />
      {erreur && <p className="alerte">{erreur}</p>}
      {vignette && (
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
              inputProps={proprietesVignette(vignette, bases)}
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
            À refaire après chaque changement de pose, d’accroche, de logos, de captures ou de gabarit, avant de valider.
          </p>
        </>
      )}
    </fieldset>
  );
};

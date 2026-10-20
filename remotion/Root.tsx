import type { FC } from 'react';
import { type CalculateMetadataFunction, Composition, Folder, Still } from 'remotion';
import { dureeEpisode, dureeVideoComplete } from '../noyau/decisions';
import { enImages } from '../noyau/images';
import { ApercuElement, ApercuEncart, ApercuLogo, elementDemo } from './apercus';
import { durees, FPS_HABILLAGE, HAUTEUR, LARGEUR } from './charte';
import { CartonFin } from './composants/CartonFin';
import { Generique } from './composants/Generique';
import { Intertitre } from './composants/Intertitre';
import { HAUTEUR_VIGNETTE, LARGEUR_VIGNETTE, Vignette } from './composants/Vignette';
import { Episode, type ProprietesEpisode } from './compositions/Episode';
import { VideoComplete, type ProprietesVideoComplete } from './compositions/VideoComplete';
import { exempleEpisode, exempleVideoComplete } from './exemple';

const generique = enImages(durees.generique, FPS_HABILLAGE);
const intertitre = enImages(durees.intertitre, FPS_HABILLAGE);
const cartonFin = enImages(durees.cartonFin, FPS_HABILLAGE);
const encart = enImages(durees.encart, FPS_HABILLAGE);
const demo = enImages(4, FPS_HABILLAGE);
const NATURES = ['zoom', 'miseEnAvant', 'texte', 'camera'] as const;

const metaEpisode: CalculateMetadataFunction<ProprietesEpisode> = ({ props }) => ({
  durationInFrames: Math.max(1, dureeEpisode(props.decisions)),
  fps: props.decisions.fps,
});

const metaVideoComplete: CalculateMetadataFunction<ProprietesVideoComplete> = ({ props }) => ({
  durationInFrames: Math.max(1, dureeVideoComplete(props.decisions)),
  fps: props.decisions.fps,
});

export const RemotionRoot: FC = () => (
  <>
  <Folder name="Habillage">
    <Still id="Logo" component={ApercuLogo} width={600} height={600} />
    <Composition
      id="Generique" component={Generique} durationInFrames={generique} fps={FPS_HABILLAGE} width={LARGEUR} height={HAUTEUR}
      defaultProps={{ titre: 'There : exportez vos documents en Markdown pour l’IA', duree: generique }}
    />
    <Composition
      id="Intertitre" component={Intertitre} durationInFrames={intertitre} fps={FPS_HABILLAGE} width={LARGEUR} height={HAUTEUR}
      defaultProps={{ titre: 'Windows + V : retrouvez tout ce que vous avez copié', numero: 2, duree: intertitre }}
    />
    <Composition
      id="CartonFin" component={CartonFin} durationInFrames={cartonFin} fps={FPS_HABILLAGE} width={LARGEUR} height={HAUTEUR}
      defaultProps={{ duree: cartonFin }}
    />
    <Composition
      id="EncartDefinition" component={ApercuEncart} durationInFrames={encart} fps={FPS_HABILLAGE} width={LARGEUR} height={HAUTEUR}
      defaultProps={{
        terme: 'Markdown',
        definition: 'Format de texte simple qui utilise des symboles (#, *, |…) pour indiquer la mise en forme : titres, gras, tableaux.',
        position: 'bas' as const,
        duree: encart,
      }}
    />
  </Folder>
    <Folder name="Elements-ecran">
      {NATURES.map(n => (
        <Composition
          key={n} id={`Element-${n}`} component={ApercuElement} durationInFrames={demo} fps={FPS_HABILLAGE}
          width={LARGEUR} height={HAUTEUR} defaultProps={{ element: elementDemo(n, demo) }}
        />
      ))}
    </Folder>
    <Folder name="Vignettes">
      <Still
        id="Vignette" component={Vignette} width={LARGEUR_VIGNETTE} height={HAUTEUR_VIGNETTE}
        defaultProps={{ fondUrl: null, poseUrl: null, accroche: 'Windows + V : le presse-papiers caché' }}
      />
    </Folder>
    <Folder name="Rendus">
      <Composition
        id="Episode" component={Episode} durationInFrames={1} fps={FPS_HABILLAGE} width={LARGEUR} height={HAUTEUR}
        defaultProps={{ decisions: exempleEpisode }} calculateMetadata={metaEpisode}
      />
      <Composition
        id="VideoComplete" component={VideoComplete} durationInFrames={1} fps={FPS_HABILLAGE} width={LARGEUR} height={HAUTEUR}
        defaultProps={{ decisions: exempleVideoComplete }} calculateMetadata={metaVideoComplete}
      />
    </Folder>
  </>
);

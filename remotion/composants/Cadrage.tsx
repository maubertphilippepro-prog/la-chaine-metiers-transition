import type { FC, ReactNode } from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ElementImages } from '../../noyau/decisions';
import { progressionElement, transformationZoom } from '../calculs';
import { CameraEnGrand, DECOUPE_CAMERA, enCss, TRANSITION_CAMERA } from './CameraEnGrand';

// Transition du zoom, en secondes ; flou maximal de l'écran derrière la caméra en grand, en pixels.
const TRANSITION_ZOOM = 0.5;
const FLOU = 16;

type Zoom = Extract<ElementImages, { nature: 'zoom' }>;
type Camera = Extract<ElementImages, { nature: 'camera' }>;
const actif = (e: ElementImages, frame: number) => frame >= e.debut && frame < e.debut + e.duree;

// Zoom et caméra en grand appliqués à la couche vidéo. La couche est redessinée (muette) pour la vignette caméra :
// reposée à sa place pendant un zoom, agrandie pendant la caméra en grand. Chaque copie est montée un peu avant
// l'élément (premount) et remise à l'heure de la partie par une séquence décalée de -debut.
export const Cadrage: FC<{ elements: ElementImages[]; couche: (muette: boolean) => ReactNode }> = ({ elements, couche }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zooms = elements.filter((e): e is Zoom => e.nature === 'zoom');
  const cameras = elements.filter((e): e is Camera => e.nature === 'camera');
  const zoom = zooms.find(e => actif(e, frame));
  const cameraActive = cameras.find(e => actif(e, frame));
  const transformation = zoom
    ? transformationZoom(zoom.zone, progressionElement(frame - zoom.debut, zoom.duree, TRANSITION_ZOOM * fps))
    : null;
  const flou = cameraActive ? progressionElement(frame - cameraActive.debut, cameraActive.duree, TRANSITION_CAMERA * fps) : 0;

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: 'black' }}>
      <AbsoluteFill
        style={{
          transformOrigin: '0 0',
          transform: transformation ? enCss(transformation) : undefined,
          filter: flou > 0 ? `blur(${FLOU * flou}px)` : undefined,
        }}
      >
        {couche(false)}
      </AbsoluteFill>
      {zooms.map(e => (
        <Sequence key={e.id} from={e.debut} durationInFrames={e.duree} premountFor={fps}>
          <AbsoluteFill style={{ clipPath: DECOUPE_CAMERA }}>
            <Sequence from={-e.debut}>{couche(true)}</Sequence>
          </AbsoluteFill>
        </Sequence>
      ))}
      {cameras.map(e => (
        <Sequence key={e.id} from={e.debut} durationInFrames={e.duree} premountFor={fps}>
          <CameraEnGrand duree={e.duree}>
            <Sequence from={-e.debut}>{couche(true)}</Sequence>
          </CameraEnGrand>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

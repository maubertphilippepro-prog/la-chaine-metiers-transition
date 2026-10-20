import type { FC, ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { progressionElement, transformationCamera, type Transformation } from '../calculs';
import { camera, HAUTEUR, LARGEUR } from '../charte';

// Transition de la caméra en grand, en secondes.
export const TRANSITION_CAMERA = 0.4;
const VOILE = 0.5;

// Découpe de la vignette caméra dans l'image plein cadre (clip-path, avant transformation).
export const DECOUPE_CAMERA =
  `inset(${camera.y}px ${LARGEUR - camera.x - camera.largeur}px ${HAUTEUR - camera.y - camera.hauteur}px ${camera.x}px)`;

export const enCss = (t: Transformation) => `translate(${t.x}px, ${t.y}px) scale(${t.echelle})`;

// Aparté face caméra : l'écran derrière s'assombrit (le flou est posé par Cadrage) et la vignette, découpée
// dans la copie de la couche vidéo reçue en enfant, passe à deux fois sa taille au centre.
export const CameraEnGrand: FC<{ duree: number; children: ReactNode }> = ({ duree, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = progressionElement(frame, duree, TRANSITION_CAMERA * fps);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: `rgba(0, 0, 0, ${VOILE * p})` }} />
      <AbsoluteFill style={{ transformOrigin: '0 0', transform: enCss(transformationCamera(camera, p)), clipPath: DECOUPE_CAMERA }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

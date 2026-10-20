import type { FC } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { Zone } from '../../noyau/types';
import { progressionElement } from '../calculs';
import { charte, HAUTEUR, LARGEUR } from '../charte';

const FONDU = 12;

// Hors de la zone, l'image s'assombrit (voile noir à 60 %) ; la zone reçoit un cadre rouge. Fondu d'entrée et de sortie.
export const MiseEnAvant: FC<{ zone: Zone; duree: number }> = ({ zone, duree }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: progressionElement(frame, duree, FONDU) }}>
      <div
        style={{
          position: 'absolute', left: zone.x, top: zone.y, width: zone.largeur, height: zone.hauteur, borderRadius: 4,
          boxShadow: `0 0 0 ${LARGEUR + HAUTEUR}px rgba(0, 0, 0, 0.6)`, outline: `6px solid ${charte.rouge}`,
        }}
      />
    </AbsoluteFill>
  );
};

import type { FC } from 'react';
import { Img, staticFile } from 'remotion';
import { charte } from '../charte';

// Proportions du fichier public/logo/metiers-transition.svg (116 × 36).
export const RAPPORT_LOGO_MT = 116 / 36;

// Logo « Métiers & Transition ». Posé sur l'image, il prend une plaque blanche de la hauteur donnée.
export const LogoMT: FC<{ hauteur: number; plaque?: boolean }> = ({ hauteur, plaque = false }) => {
  const marge = plaque ? hauteur * 0.16 : 0;
  const hauteurLogo = hauteur - 2 * marge;
  return (
    <div style={{ backgroundColor: plaque ? charte.blanc : undefined, padding: `${marge}px ${marge * 1.4}px`, flexShrink: 0 }}>
      <Img
        src={staticFile('logo/metiers-transition.svg')}
        style={{ display: 'block', height: hauteurLogo, width: hauteurLogo * RAPPORT_LOGO_MT }}
      />
    </div>
  );
};

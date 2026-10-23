import type { FC } from 'react';
import { AbsoluteFill } from 'remotion';
import type { Gabarit } from '../../noyau/gabarits';
import type { ProprietesVignette } from '../../noyau/publication';
import { charte } from '../charte';
import { police } from '../police';
import { Classique } from './vignette/Classique';
import { Demonstration } from './vignette/Demonstration';
import { Mosaique } from './vignette/Mosaique';
import { Vitrine } from './vignette/Vitrine';

export { HAUTEUR_VIGNETTE, LARGEUR_VIGNETTE } from './vignette/dimensions';
export type { ProprietesVignette };

const MISES_EN_PAGE: Record<Gabarit, FC<ProprietesVignette>> = {
  classique: Classique, vitrine: Vitrine, demonstration: Demonstration, mosaique: Mosaique,
};

// Vignette 1280×720 : le gabarit choisi place pose, fond, accroche, logos et captures.
export const Vignette: FC<ProprietesVignette> = props => {
  const MiseEnPage = MISES_EN_PAGE[props.gabarit];
  return (
    <AbsoluteFill style={{ backgroundColor: charte.blanc, fontFamily: police, overflow: 'hidden' }}>
      <MiseEnPage {...props} />
    </AbsoluteFill>
  );
};

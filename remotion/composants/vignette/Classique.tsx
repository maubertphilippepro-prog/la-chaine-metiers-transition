import type { FC } from 'react';
import type { ProprietesVignette } from '../../../noyau/publication';
import { LogoMT } from '../LogoMT';
import { Accroche, BandeRouge, FACTEURS_ACCROCHE, Fond, miroir, Pose } from './briques';

// Bande rouge, logo en haut à gauche, accroche à gauche, pose en grand à droite (ou l'inverse, pose à gauche).
export const Classique: FC<ProprietesVignette> = ({ poseUrl, accroche, mise }) => {
  const g = mise.cotePose === 'gauche';
  return (
    <>
      <Fond />
      <BandeRouge />
      <Pose url={poseUrl} style={miroir({ right: 0, maxWidth: '55%', objectPosition: 'right bottom' }, mise.cotePose)} />
      <div style={{ position: 'absolute', ...(g ? { right: 64 } : { left: 64 }), top: 40 }}>
        <LogoMT hauteur={72} />
      </div>
      <div style={{ position: 'absolute', ...(g ? { right: 64 } : { left: 64 }), top: 150, bottom: 60, width: 640, display: 'flex', alignItems: 'center' }}>
        <Accroche texte={accroche} largeur={640} facteur={FACTEURS_ACCROCHE[mise.tailleAccroche]} />
      </div>
    </>
  );
};

import type { FC } from 'react';
import type { ProprietesVignette } from '../../../noyau/publication';
import { LogoMT } from '../LogoMT';
import { Accroche, BandeRouge, Fond, Pose } from './briques';

// Bande rouge, logo en haut à gauche (sur plaque blanche quand le fond est l'écran), accroche à gauche, pose en grand à droite.
export const Classique: FC<ProprietesVignette> = ({ fondUrl, poseUrl, accroche }) => (
  <>
    <Fond url={fondUrl} />
    <BandeRouge />
    <Pose url={poseUrl} style={{ right: 0, maxWidth: '55%', objectPosition: 'right bottom' }} />
    <div style={{ position: 'absolute', left: 64, top: 40 }}>
      <LogoMT hauteur={fondUrl ? 88 : 72} plaque={fondUrl !== null} />
    </div>
    <div style={{ position: 'absolute', left: 64, top: 150, bottom: 60, width: 640, display: 'flex', alignItems: 'center' }}>
      <Accroche texte={accroche} largeur={640} sombre={fondUrl !== null} />
    </div>
  </>
);

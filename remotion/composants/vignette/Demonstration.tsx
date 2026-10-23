import type { FC } from 'react';
import type { ProprietesVignette } from '../../../noyau/publication';
import { LogoMT } from '../LogoMT';
import { Bandeau, BandeRouge, CarteCapture, Fond, Pose, TuileLogo } from './briques';

// Première capture en grande carte à gauche, premier logo épinglé dans son coin, pose à droite, accroche en bandeau dessous.
export const Demonstration: FC<ProprietesVignette> = ({ fondUrl, poseUrl, logoUrls, captureUrls, accroche }) => (
  <>
    <Fond url={fondUrl} />
    <BandeRouge />
    {captureUrls[0] && <CarteCapture url={captureUrls[0]} largeur={700} hauteur={394} angle={-3} style={{ left: 70, top: 120 }} />}
    <Pose url={poseUrl} style={{ right: 0, maxWidth: '45%', objectPosition: 'right bottom' }} />
    {logoUrls[0] && <TuileLogo url={logoUrls[0]} taille={150} angle={-10} style={{ left: 30, top: 70 }} />}
    <div style={{ position: 'absolute', left: 240, top: 28 }}>
      <LogoMT hauteur={64} plaque={fondUrl !== null} />
    </div>
    <div style={{ position: 'absolute', left: 70, bottom: 40, width: 760 }}>
      <Bandeau texte={accroche} largeur={760} tailleMax={64} />
    </div>
  </>
);

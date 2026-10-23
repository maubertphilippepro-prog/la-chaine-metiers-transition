import type { FC } from 'react';
import type { ProprietesVignette } from '../../../noyau/publication';
import { LogoMT } from '../LogoMT';
import { Accroche, BandeRouge, CarteCapture, Fond, Pose, TuileLogo } from './briques';

// Captures en éventail sous l'accroche.
const PLACES_CAPTURES = [
  { place: { left: 40, top: 250 }, angle: -6 },
  { place: { left: 380, top: 300 }, angle: 5 },
  { place: { left: 230, top: 450 }, angle: -2 },
];

// Accroche en haut à gauche, 2 ou 3 captures en éventail dessous, pose à droite, premier logo en tuile.
export const Mosaique: FC<ProprietesVignette> = ({ fondUrl, poseUrl, logoUrls, captureUrls, accroche }) => (
  <>
    <Fond url={fondUrl} />
    <BandeRouge />
    {captureUrls.slice(0, PLACES_CAPTURES.length).map((url, i) => (
      <CarteCapture key={url} url={url} largeur={400} hauteur={225} angle={PLACES_CAPTURES[i]!.angle} style={PLACES_CAPTURES[i]!.place} />
    ))}
    <Pose url={poseUrl} style={{ right: 0, maxWidth: '42%', objectPosition: 'right bottom' }} />
    {logoUrls[0] && <TuileLogo url={logoUrls[0]} taille={120} angle={8} style={{ left: 640, top: 230 }} />}
    <div style={{ position: 'absolute', left: 64, top: 36, width: 700, height: 190, display: 'flex', alignItems: 'center' }}>
      <Accroche texte={accroche} largeur={700} sombre={fondUrl !== null} tailleMax={80} />
    </div>
    <div style={{ position: 'absolute', left: 64, bottom: 24 }}>
      <LogoMT hauteur={52} plaque={fondUrl !== null} />
    </div>
  </>
);

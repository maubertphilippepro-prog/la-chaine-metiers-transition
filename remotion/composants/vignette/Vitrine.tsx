import type { FC } from 'react';
import type { ProprietesVignette } from '../../../noyau/publication';
import { LogoMT } from '../LogoMT';
import { Bandeau, FondDegrade, Pose, TuileLogo } from './briques';

// Places des tuiles autour de la tête : gauche, droite haut, droite bas.
const PLACES_LOGOS = [
  { place: { left: 110, top: 140 }, angle: -8 },
  { place: { right: 110, top: 110 }, angle: 7 },
  { place: { right: 210, top: 340 }, angle: -4 },
];

// Pose au centre sur fond dégradé, logos flottant autour de la tête, accroche en bandeau en bas. Le fond choisi est ignoré.
export const Vitrine: FC<ProprietesVignette> = ({ poseUrl, logoUrls, accroche }) => (
  <>
    <FondDegrade />
    <Pose url={poseUrl} style={{ left: '50%', transform: 'translateX(-50%)', height: '94%' }} />
    {logoUrls.slice(0, PLACES_LOGOS.length).map((url, i) => (
      <TuileLogo key={url} url={url} taille={170} angle={PLACES_LOGOS[i]!.angle} style={PLACES_LOGOS[i]!.place} />
    ))}
    <div style={{ position: 'absolute', left: 40, top: 30 }}>
      <LogoMT hauteur={64} plaque />
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 44, display: 'flex', justifyContent: 'center' }}>
      <Bandeau texte={accroche} largeur={1000} tailleMax={72} />
    </div>
  </>
);

import type { FC } from 'react';
import type { ProprietesVignette } from '../../../noyau/publication';
import { LogoMT } from '../LogoMT';
import { Bandeau, FACTEURS_ACCROCHE, FondDegrade, miroir, ordreVedette, Pose, TuileLogo } from './briques';

// Places des tuiles autour de la tête : gauche, droite haut, droite bas.
const PLACES_LOGOS = [
  { place: { left: 110, top: 140 }, angle: -8 },
  { place: { right: 110, top: 110 }, angle: 7 },
  { place: { right: 210, top: 340 }, angle: -4 },
];

// Pose au centre sur fond dégradé, logos flottant autour de la tête, accroche en bandeau en bas. La pose reste au centre :
// « pose à gauche » inverse seulement les places des logos.
export const Vitrine: FC<ProprietesVignette> = ({ poseUrl, logoUrls, accroche, mise, vedette }) => {
  const places = mise.cotePose === 'gauche'
    ? [...PLACES_LOGOS].reverse().map(p => ({ ...p, place: miroir(p.place, 'gauche') }))
    : PLACES_LOGOS;
  const logos = ordreVedette(logoUrls, vedette);
  return (
    <>
      <FondDegrade />
      <Pose url={poseUrl} style={{ left: '50%', transform: 'translateX(-50%)', height: '94%' }} />
      {logos.slice(0, places.length).map((url, i) => (
        <TuileLogo key={url} url={url} taille={i === 0 && vedette !== null ? 212 : 170} angle={places[i]!.angle} style={places[i]!.place} />
      ))}
      <div style={{ position: 'absolute', left: 40, top: 30 }}>
        <LogoMT hauteur={64} plaque />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 44, display: 'flex', justifyContent: 'center' }}>
        <Bandeau texte={accroche} largeur={1000} tailleMax={72} facteur={FACTEURS_ACCROCHE[mise.tailleAccroche]} />
      </div>
    </>
  );
};

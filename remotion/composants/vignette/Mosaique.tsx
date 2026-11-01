import type { FC } from 'react';
import type { ProprietesVignette } from '../../../noyau/publication';
import { LogoMT } from '../LogoMT';
import { Accroche, BandeRouge, CarteCapture, FACTEURS_ACCROCHE, Fond, miroir, ordreVedette, Pose, TuileLogo } from './briques';

// Captures en éventail sous l'accroche.
const PLACES_CAPTURES = [
  { place: { left: 40, top: 250 }, angle: -6 },
  { place: { left: 380, top: 300 }, angle: 5 },
  { place: { left: 230, top: 450 }, angle: -2 },
];

// Accroche en haut à gauche, 2 ou 3 captures en éventail dessous, pose à droite, premier logo en tuile. Pose à gauche :
// tout passe de l'autre côté.
export const Mosaique: FC<ProprietesVignette> = ({ poseUrl, logoUrls, captureUrls, accroche, mise, vedette }) => {
  const g = mise.cotePose === 'gauche';
  const logos = ordreVedette(logoUrls, vedette);
  return (
    <>
      <Fond />
      <BandeRouge />
      {captureUrls.slice(0, PLACES_CAPTURES.length).map((url, i) => (
        <CarteCapture key={url} url={url} recadrage={mise.recadrages[i]} largeur={400} hauteur={225} angle={PLACES_CAPTURES[i]!.angle}
          style={miroir(PLACES_CAPTURES[i]!.place, mise.cotePose)} />
      ))}
      <Pose url={poseUrl} style={miroir({ right: 0, maxWidth: '42%', objectPosition: 'right bottom' }, mise.cotePose)} />
      {logos[0] && <TuileLogo url={logos[0]} taille={vedette !== null ? 150 : 120} angle={8} style={miroir({ left: 640, top: 230 }, mise.cotePose)} />}
      <div style={{ position: 'absolute', ...(g ? { right: 64 } : { left: 64 }), top: 36, width: 700, height: 190, display: 'flex', alignItems: 'center' }}>
        <Accroche texte={accroche} largeur={700} tailleMax={80} facteur={FACTEURS_ACCROCHE[mise.tailleAccroche]} />
      </div>
      <div style={{ position: 'absolute', ...(g ? { right: 64 } : { left: 64 }), bottom: 24 }}>
        <LogoMT hauteur={52} />
      </div>
    </>
  );
};

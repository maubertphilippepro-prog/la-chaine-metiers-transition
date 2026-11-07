import type { FC } from 'react';
import type { ProprietesVignette } from '../../../noyau/publication';
import { LogoMT } from '../LogoMT';
import { Bandeau, BandeRouge, CarteCapture, FACTEURS_ACCROCHE, Fond, miroir, ordreVedette, Pose, TuileLogo } from './briques';

// Première capture en grande carte à gauche, premier logo épinglé dans son coin, pose à droite, accroche en bandeau dessous.
// Pose à gauche : tout passe de l'autre côté.
export const Demonstration: FC<ProprietesVignette> = ({ poseUrl, logoUrls, captureUrls, accroche, mise, vedette }) => {
  const g = mise.cotePose === 'gauche';
  const logos = ordreVedette(logoUrls, vedette);
  return (
    <>
      <Fond />
      <BandeRouge />
      {captureUrls[0] && <CarteCapture url={captureUrls[0]} recadrage={mise.recadrages[0]} largeur={700} hauteur={394} angle={-3} style={g ? { right: 70, top: 120 } : { left: 70, top: 120 }} />}
      <Pose url={poseUrl} style={miroir({ right: 0, maxWidth: '45%', objectPosition: 'right bottom' }, mise.cotePose)} />
      {logos[0] && <TuileLogo url={logos[0]} taille={vedette !== null ? 190 : 150} angle={-10} style={g ? { right: 30, top: 70 } : { left: 30, top: 70 }} />}
      <div style={{ position: 'absolute', ...(g ? { right: 240 } : { left: 240 }), top: 28 }}>
        <LogoMT hauteur={64} />
      </div>
      <div style={{ position: 'absolute', ...(g ? { right: 70 } : { left: 70 }), bottom: 40, width: 760 }}>
        <Bandeau texte={accroche} largeur={760} tailleMax={64} facteur={FACTEURS_ACCROCHE[mise.tailleAccroche]} />
      </div>
    </>
  );
};

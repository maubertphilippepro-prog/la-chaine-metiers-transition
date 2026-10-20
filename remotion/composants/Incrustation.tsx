import type { FC } from 'react';
import type { ElementImages } from '../../noyau/decisions';
import { MiseEnAvant } from './MiseEnAvant';
import { TexteIncruste } from './TexteIncruste';

// Ce qui se pose au-dessus de la vidéo ; le zoom et la caméra en grand agissent sur la vidéo elle-même (Cadrage).
export const Incrustation: FC<{ element: ElementImages }> = ({ element: e }) => {
  if (e.nature === 'miseEnAvant') return <MiseEnAvant zone={e.zone} duree={e.duree} />;
  if (e.nature === 'texte') return <TexteIncruste texte={e.texte} position={e.position} duree={e.duree} />;
  return null;
};

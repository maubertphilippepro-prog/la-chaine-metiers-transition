import type { FC } from 'react';
import type { DecisionsVideoComplete } from '../../noyau/decisions';
import { CartonFin } from '../composants/CartonFin';
import { Generique } from '../composants/Generique';
import { Intertitre } from '../composants/Intertitre';
import { Enchainement, type Morceau } from './Enchainement';
import { VideoMontee } from './VideoMontee';

export type ProprietesVideoComplete = { decisions: DecisionsVideoComplete };

// Générique (titre du montage) → chapitre 1 → intertitre → chapitre 2 → … → carton de fin.
export const VideoComplete: FC<ProprietesVideoComplete> = ({ decisions: d }) => {
  const morceaux: Morceau[] = [
    { cle: 'generique', duree: d.durees.generique, contenu: <Generique titre={d.titre} duree={d.durees.generique} /> },
  ];
  d.parties.forEach((p, i) => {
    if (i > 0) {
      morceaux.push({
        cle: `intertitre-${i}`, duree: d.durees.intertitre,
        contenu: <Intertitre titre={p.titre} numero={i + 1} duree={d.durees.intertitre} />,
      });
    }
    morceaux.push({
      cle: `partie-${i}`, duree: p.duree,
      contenu: <VideoMontee partie={p} sourceUrl={d.sourceUrl} fondu={d.durees.fonduAudio} />,
    });
  });
  morceaux.push({ cle: 'carton', duree: d.durees.cartonFin, contenu: <CartonFin duree={d.durees.cartonFin} /> });
  return <Enchainement morceaux={morceaux} premount={d.fps} />;
};

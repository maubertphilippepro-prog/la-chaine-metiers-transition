import type { FC } from 'react';
import type { DecisionsEpisode } from '../../noyau/decisions';
import { CartonFin } from '../composants/CartonFin';
import { Generique } from '../composants/Generique';
import { Enchainement } from './Enchainement';
import { VideoMontee } from './VideoMontee';

export type ProprietesEpisode = { decisions: DecisionsEpisode };

// Générique (titre du chapitre) → contenu du chapitre → carton de fin.
export const Episode: FC<ProprietesEpisode> = ({ decisions: d }) => (
  <Enchainement
    premount={d.fps}
    morceaux={[
      { cle: 'generique', duree: d.durees.generique, contenu: <Generique titre={d.titre} duree={d.durees.generique} /> },
      { cle: 'contenu', duree: d.partie.duree, contenu: <VideoMontee partie={d.partie} sourceUrl={d.sourceUrl} fondu={d.durees.fonduAudio} /> },
      { cle: 'carton', duree: d.durees.cartonFin, contenu: <CartonFin duree={d.durees.cartonFin} /> },
    ]}
  />
);

import type { FC, ReactNode } from 'react';
import { Series } from 'remotion';

export interface Morceau {
  cle: string;
  duree: number;
  contenu: ReactNode;
}

// Enchaîne les morceaux bout à bout ; un morceau vide est ignoré.
export const Enchainement: FC<{ morceaux: Morceau[]; premount: number }> = ({ morceaux, premount }) => (
  <Series>
    {morceaux
      .filter(m => m.duree > 0)
      .map(m => (
        <Series.Sequence key={m.cle} durationInFrames={m.duree} premountFor={premount}>
          {m.contenu}
        </Series.Sequence>
      ))}
  </Series>
);

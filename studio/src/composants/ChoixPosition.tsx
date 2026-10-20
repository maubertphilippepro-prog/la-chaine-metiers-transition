import type { FC } from 'react';
import type { PositionTexte } from '../../../noyau/types';

export const LIBELLES_POSITION: Record<PositionTexte, string> = {
  'haut-gauche': 'En haut à gauche',
  'haut-droite': 'En haut à droite',
  centre: 'Au centre',
  'bas-centre': 'En bas au centre',
};

const POSITIONS = Object.keys(LIBELLES_POSITION) as PositionTexte[];

export const ChoixPosition: FC<{ valeur: PositionTexte; onChange: (p: PositionTexte) => void }> = ({ valeur, onChange }) => (
  <select value={valeur} aria-label="Position du texte" onChange={e => onChange(e.target.value as PositionTexte)}>
    {POSITIONS.map(p => <option key={p} value={p}>{LIBELLES_POSITION[p]}</option>)}
  </select>
);

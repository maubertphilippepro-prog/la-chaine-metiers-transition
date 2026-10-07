import type { FC } from 'react';
import { AbsoluteFill } from 'remotion';
import type { PositionEncart } from '../noyau/types';
import { charte } from './charte';
import { EncartDefinition } from './composants/EncartDefinition';
import { LogoPMT } from './composants/LogoPMT';

export const ApercuLogo: FC = () => (
  <AbsoluteFill style={{ backgroundColor: charte.blanc, alignItems: 'center', justifyContent: 'center' }}>
    <LogoPMT taille={400} />
  </AbsoluteFill>
);

// Fond bleu-gris pour simuler la vidéo derrière l'encart.
export const ApercuEncart: FC<{ terme: string; definition: string; position: PositionEncart; duree: number }> = props => (
  <AbsoluteFill style={{ backgroundColor: charte.bleuGris }}>
    <EncartDefinition {...props} />
  </AbsoluteFill>
);

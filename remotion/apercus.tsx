import type { FC } from 'react';
import { AbsoluteFill } from 'remotion';
import { charte } from './charte';
import { LogoPMT } from './composants/LogoPMT';

export const ApercuLogo: FC = () => (
  <AbsoluteFill style={{ backgroundColor: charte.blanc, alignItems: 'center', justifyContent: 'center' }}>
    <LogoPMT taille={400} />
  </AbsoluteFill>
);

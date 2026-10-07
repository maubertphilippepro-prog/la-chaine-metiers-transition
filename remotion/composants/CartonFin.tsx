import type { FC } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { charte } from '../charte';
import { police } from '../police';
import { LogoPMT } from './LogoPMT';

export const CartonFin: FC<{ duree: number }> = ({ duree }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 200 } });
  const texte = spring({ frame: frame - 12, fps, config: { damping: 200 } });
  const sortie = interpolate(frame, [duree - 15, duree], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{ backgroundColor: charte.blanc, opacity: sortie, fontFamily: police, alignItems: 'center', justifyContent: 'center', gap: 40 }}
    >
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 24, backgroundColor: charte.rouge }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 24, height: 12, backgroundColor: charte.bleu }} />
      <div style={{ transform: `scale(${logo})` }}>
        <LogoPMT taille={260} />
      </div>
      <div style={{ opacity: texte, textAlign: 'center' }}>
        <div style={{ fontSize: 64, fontWeight: 700, color: charte.bleu }}>Merci d'avoir regardé !</div>
        <div style={{ fontSize: 44, color: charte.rouge, marginTop: 12 }}>
          Abonnez-vous à {charte.nomChaine} pour ne rien manquer
        </div>
      </div>
    </AbsoluteFill>
  );
};

import type { FC } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { charte } from '../charte';
import { police } from '../police';

export const Intertitre: FC<{ titre: string; numero: number; duree: number }> = ({ titre, numero, duree }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const apparition = spring({ frame, fps, config: { damping: 200 } });
  const sortie = interpolate(frame, [duree - 8, duree], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: charte.bleu, opacity: sortie, fontFamily: police,
        justifyContent: 'center', paddingLeft: 200, paddingRight: 200,
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 40 + 120 * apparition, backgroundColor: charte.rouge }} />
      <div style={{ color: charte.bleuGris, fontSize: 40, fontWeight: 700, opacity: apparition }}>Chapitre {numero}</div>
      <div
        style={{
          color: charte.blanc, fontSize: 84, fontWeight: 700, lineHeight: 1.15,
          opacity: apparition, transform: `translateX(${(1 - apparition) * 60}px)`,
        }}
      >
        {titre}
      </div>
    </AbsoluteFill>
  );
};

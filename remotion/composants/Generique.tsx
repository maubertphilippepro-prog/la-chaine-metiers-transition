import type { FC } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { charte } from '../charte';
import { police } from '../police';
import { LogoPMT } from './LogoPMT';

// Les formes de la charte se construisent, puis le logo et le titre apparaissent.
export const Generique: FC<{ titre: string; duree: number }> = ({ titre, duree }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entree = (delai: number) => spring({ frame: frame - delai, fps, config: { damping: 200 } });
  const sortie = interpolate(frame, [duree - 10, duree], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const bande = entree(0);
  const cercle = entree(8);
  const triangle = entree(16);
  const texte = entree(30);

  return (
    <AbsoluteFill style={{ backgroundColor: charte.blanc, opacity: sortie, fontFamily: police }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 260, backgroundColor: charte.rouge, transform: `translateX(${(bande - 1) * 260}px)` }} />
      <div style={{ position: 'absolute', left: 180, top: 140, width: 220, height: 220, borderRadius: '50%', backgroundColor: charte.bleu, transform: `scale(${cercle})` }} />
      <div
        style={{
          position: 'absolute', right: 0, bottom: 0, width: 0, height: 0,
          borderBottom: `420px solid ${charte.bleuGris}`, borderLeft: '420px solid transparent',
          transform: `translateY(${(1 - triangle) * 420}px)`,
        }}
      />
      <div
        style={{
          position: 'absolute', left: 460, right: 200, top: 0, bottom: 0,
          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 36,
          opacity: texte, transform: `translateY(${(1 - texte) * 40}px)`,
        }}
      >
        <LogoPMT hauteur={120} />
        <div style={{ fontSize: 76, fontWeight: 700, color: charte.bleu, lineHeight: 1.15 }}>{titre}</div>
      </div>
    </AbsoluteFill>
  );
};

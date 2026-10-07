import type { FC } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { PositionEncart } from '../../noyau/types';
import { charte, NOIR_TEXTE } from '../charte';
import { police } from '../police';

type Proprietes = { terme: string; definition: string; position: PositionEncart; duree: number };

export const EncartDefinition: FC<Proprietes> = ({ terme, definition, position, duree }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entree = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 15 });
  const sortie = interpolate(frame, [duree - 12, duree], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const visible = Math.min(entree, sortie);
  const ancrage = position === 'haut' ? { top: 48 } : { bottom: 48 };

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute', right: 48, ...ancrage, width: 720,
          display: 'flex', overflow: 'hidden', borderRadius: 12,
          backgroundColor: charte.blanc, boxShadow: '0 12px 40px rgba(0, 0, 0, 0.25)',
          fontFamily: police, opacity: visible, transform: `translateX(${(1 - visible) * 120}px)`,
        }}
      >
        <div style={{ width: 14, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ flex: 1, backgroundColor: charte.rouge }} />
          <div style={{ flex: 1, backgroundColor: charte.bleu }} />
        </div>
        <div style={{ padding: '22px 28px' }}>
          <div style={{ fontSize: 38, fontWeight: 700, color: charte.bleu }}>{terme}</div>
          <div style={{ fontSize: 28, color: NOIR_TEXTE, lineHeight: 1.3, marginTop: 6 }}>{definition}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

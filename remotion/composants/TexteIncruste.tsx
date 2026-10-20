import type { CSSProperties, FC } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { PositionTexte } from '../../noyau/types';
import { charte, FRISE } from '../charte';
import { police } from '../police';

// Les coins bas sont exclus : vignette caméra à gauche, logo à droite.
const ANCRAGES: Record<PositionTexte, CSSProperties> = {
  'haut-gauche': { top: 48, left: 48 },
  'haut-droite': { top: 48, right: 48 },
  centre: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  'bas-centre': { bottom: FRISE + 48, left: '50%', transform: 'translateX(-50%)' },
};

// Étiquette au fond bleu, texte blanc, filet rouge à gauche ; entrée et sortie comme les encarts.
export const TexteIncruste: FC<{ texte: string; position: PositionTexte; duree: number }> = ({ texte, position, duree }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entree = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 15 });
  const sortie = interpolate(frame, [duree - 12, duree], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const visible = Math.min(entree, sortie);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', ...ANCRAGES[position] }}>
        <div
          style={{
            display: 'flex', overflow: 'hidden', borderRadius: 10, backgroundColor: charte.bleu,
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.25)', opacity: visible, transform: `translateY(${(1 - visible) * 30}px)`,
          }}
        >
          <div style={{ width: 12, flexShrink: 0, backgroundColor: charte.rouge }} />
          <div style={{ padding: '16px 28px', fontFamily: police, fontSize: 36, fontWeight: 700, color: charte.blanc, whiteSpace: 'nowrap' }}>
            {texte}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

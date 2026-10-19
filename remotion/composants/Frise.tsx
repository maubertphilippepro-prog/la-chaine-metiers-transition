import type { FC, ReactNode } from 'react';
import { useVideoConfig } from 'remotion';
import { charte } from '../charte';

const { rouge: R, bleu: B, bleuGris: G, blanc: W } = charte;

// Six motifs carrés de la charte (rayures, anneaux, triangles), en unités de 10.
const MOTIFS: ReactNode[] = [
  <g key="rayures"><rect width="10" height="10" fill={R} /><rect x="2.5" width="2.5" height="10" fill={B} /><rect x="7.5" width="2.5" height="10" fill={B} /></g>,
  <g key="anneau"><rect width="10" height="10" fill={G} /><circle cx="5" cy="5" r="4.3" fill={R} /><circle cx="5" cy="5" r="1.7" fill={W} /></g>,
  <g key="fleche"><rect width="10" height="10" fill={R} /><path d="M0 0 L6 5 L0 10 Z" fill={B} /></g>,
  <g key="pointe"><rect width="10" height="10" fill={G} /><path d="M0 10 L5 2 L10 10 Z" fill={B} /></g>,
  <g key="coin"><rect width="10" height="10" fill={B} /><path d="M10 0 L10 10 L0 10 Z" fill={R} /></g>,
  <g key="bandes"><rect width="10" height="10" fill={B} /><rect y="2.5" width="10" height="2.5" fill={R} /><rect y="7.5" width="10" height="2.5" fill={R} /></g>,
];

// Frise fine posée en bas, par-dessus le contenu.
export const Frise: FC<{ epaisseur: number }> = ({ epaisseur: e }) => {
  const { width: l } = useVideoConfig();
  return (
    <svg width={l} height={e} style={{ position: 'absolute', left: 0, bottom: 0 }}>
      <defs>
        <pattern id="frise" width={e * MOTIFS.length} height={e} patternUnits="userSpaceOnUse">
          {MOTIFS.map((m, i) => (
            <g key={i} transform={`translate(${i * e} 0) scale(${e / 10})`}>{m}</g>
          ))}
        </pattern>
      </defs>
      <rect width={l} height={e} fill="url(#frise)" />
    </svg>
  );
};

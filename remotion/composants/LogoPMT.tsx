import type { FC } from 'react';
import { charte } from '../charte';
import { police } from '../police';

// Carré bleu, bande rouge à gauche, coin bleu-gris, texte « PMT ».
export const LogoPMT: FC<{ taille: number }> = ({ taille }) => (
  <div
    style={{
      width: taille,
      height: taille,
      position: 'relative',
      overflow: 'hidden',
      borderRadius: taille * 0.08,
      backgroundColor: charte.bleu,
    }}
  >
    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: taille * 0.14, backgroundColor: charte.rouge }} />
    <div
      style={{
        position: 'absolute', right: 0, top: 0, width: 0, height: 0,
        borderTop: `${taille * 0.3}px solid ${charte.bleuGris}`,
        borderLeft: `${taille * 0.3}px solid transparent`,
      }}
    />
    <div
      style={{
        position: 'absolute', inset: 0, paddingLeft: taille * 0.14,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: police, fontWeight: 700, fontSize: taille * 0.34, color: charte.blanc,
      }}
    >
      {charte.nomChaine}
    </div>
  </div>
);

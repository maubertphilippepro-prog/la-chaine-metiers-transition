import type { FC } from 'react';
import { charte } from '../charte';
import { police } from '../police';

export const RAPPORT_LOGO = 1.85;

// Rectangle bleu paysage, bande rouge à gauche, coin bleu-gris : « la chaîne » en fin, « PMT » en gras.
export const LogoPMT: FC<{ hauteur: number; arrondi?: boolean }> = ({ hauteur, arrondi = true }) => {
  const largeur = hauteur * RAPPORT_LOGO;
  const bande = largeur * 0.07;
  const coin = hauteur * 0.26;
  return (
    <div
      style={{
        width: largeur, height: hauteur, position: 'relative', overflow: 'hidden', flexShrink: 0,
        borderRadius: arrondi ? hauteur * 0.08 : 0, backgroundColor: charte.bleu,
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: bande, backgroundColor: charte.rouge }} />
      <div
        style={{
          position: 'absolute', right: 0, top: 0, width: 0, height: 0,
          borderTop: `${coin}px solid ${charte.bleuGris}`, borderLeft: `${coin}px solid transparent`,
        }}
      />
      <div
        style={{
          position: 'absolute', top: 0, bottom: 0, left: bande + hauteur * 0.2,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          fontFamily: police, color: charte.blanc, lineHeight: 1,
        }}
      >
        <div style={{ fontWeight: 300, fontSize: hauteur * 0.22, letterSpacing: hauteur * 0.004 }}>la chaîne</div>
        <div style={{ fontWeight: 800, fontSize: hauteur * 0.56, letterSpacing: hauteur * 0.01, marginTop: hauteur * 0.02 }}>
          {charte.nomChaine}
        </div>
      </div>
    </div>
  );
};

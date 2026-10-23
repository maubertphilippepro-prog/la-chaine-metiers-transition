import type { CSSProperties, FC } from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { tailleAccroche } from '../../calculs';
import { charte } from '../../charte';
import { HAUTEUR_VIGNETTE, LARGEUR_VIGNETTE } from './dimensions';

// Fond : écran flouté et assombri, sinon formes de la charte sur blanc.
export const Fond: FC<{ url: string | null }> = ({ url }) => (url ? (
  <>
    <Img
      src={url}
      style={{ position: 'absolute', left: -20, top: -20, width: LARGEUR_VIGNETTE + 40, height: HAUTEUR_VIGNETTE + 40, objectFit: 'cover', filter: 'blur(6px)' }}
    />
    <AbsoluteFill style={{ backgroundColor: 'rgba(0, 28, 64, 0.55)' }} />
  </>
) : (
  <>
    <div style={{ position: 'absolute', right: -120, top: -120, width: 520, height: 520, borderRadius: '50%', backgroundColor: charte.bleuGris, opacity: 0.6 }} />
    <div style={{ position: 'absolute', right: 0, bottom: 0, width: 0, height: 0, borderBottom: `320px solid ${charte.bleu}`, borderLeft: '320px solid transparent' }} />
  </>
));

// Fond sombre de la vitrine : dégradé bleu et formes de la charte, pour que les tuiles blanches ressortent.
export const FondDegrade: FC = () => (
  <>
    <AbsoluteFill style={{ background: `linear-gradient(135deg, ${charte.bleu} 0%, #00264d 100%)` }} />
    <div style={{ position: 'absolute', left: -160, bottom: -220, width: 620, height: 620, borderRadius: '50%', backgroundColor: charte.bleuGris, opacity: 0.25 }} />
    <div style={{ position: 'absolute', right: -100, top: -140, width: 420, height: 420, borderRadius: '50%', border: `40px solid ${charte.rouge}`, opacity: 0.35 }} />
  </>
);

export const BandeRouge: FC = () => (
  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 28, backgroundColor: charte.rouge }} />
);

// Pose détourée, posée sur le bas de la vignette ; `style` la place.
export const Pose: FC<{ url: string | null; style: CSSProperties }> = ({ url, style }) => (url
  ? <Img src={url} style={{ position: 'absolute', bottom: 0, height: '100%', objectFit: 'contain', ...style }} />
  : null);

// Accroche en capitales : blanche et ombrée sur un fond sombre, bleue avec un halo blanc sur la charte
// (elle reste lisible là où la pose passe dessous).
export const Accroche: FC<{ texte: string; largeur: number; sombre: boolean; tailleMax?: number }> = ({ texte, largeur, sombre, tailleMax = Infinity }) => (
  <div
    style={{
      fontSize: Math.min(tailleMax, tailleAccroche(texte, largeur)), fontWeight: 800, lineHeight: 1.05, textTransform: 'uppercase',
      color: sombre ? charte.blanc : charte.bleu,
      textShadow: sombre
        ? '0 4px 18px rgba(0, 0, 0, 0.6)'
        : '0 0 4px rgba(255, 255, 255, 1), 0 0 10px rgba(255, 255, 255, 1), 0 0 22px rgba(255, 255, 255, 0.9)',
    }}
  >
    {texte}
  </div>
);

// Accroche en bandeau rouge, texte blanc : lisible sur n'importe quel fond.
export const Bandeau: FC<{ texte: string; largeur: number; tailleMax: number }> = ({ texte, largeur, tailleMax }) => (
  <div
    style={{
      display: 'inline-block', maxWidth: largeur, padding: '10px 26px', backgroundColor: charte.rouge, color: charte.blanc,
      fontSize: Math.min(tailleMax, tailleAccroche(texte, largeur - 52)), fontWeight: 800, lineHeight: 1.05, textTransform: 'uppercase',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
    }}
  >
    {texte}
  </div>
);

// Logo de logiciel en tuile : carré blanc arrondi, ombré, légèrement penché ; `style` le place.
export const TuileLogo: FC<{ url: string; taille: number; angle: number; style: CSSProperties }> = ({ url, taille, angle, style }) => (
  <div
    style={{
      position: 'absolute', width: taille, height: taille, borderRadius: taille * 0.22, backgroundColor: charte.blanc,
      boxShadow: '0 14px 32px rgba(0, 0, 0, 0.35)', transform: `rotate(${angle}deg)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', ...style,
    }}
  >
    <Img src={url} style={{ width: '72%', height: '72%', objectFit: 'contain' }} />
  </div>
);

// Capture nette en carte : cadre blanc, coins arrondis, ombre, légère inclinaison ; `style` la place.
export const CarteCapture: FC<{ url: string; largeur: number; hauteur: number; angle: number; style: CSSProperties }> = ({
  url, largeur, hauteur, angle, style,
}) => (
  <div
    style={{
      position: 'absolute', width: largeur, height: hauteur, padding: 8, boxSizing: 'border-box', backgroundColor: charte.blanc,
      borderRadius: 14, boxShadow: '0 18px 40px rgba(0, 0, 0, 0.4)', transform: `rotate(${angle}deg)`, ...style,
    }}
  >
    <Img src={url} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
  </div>
);

import type { CSSProperties, FC } from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { tailleAccroche } from '../../calculs';
import { charte } from '../../charte';
import type { MiseEnPage, Recadrage } from '../../../noyau/mise-en-page';

// Fond de la charte : formes sur blanc.
export const Fond: FC = () => (
  <>
    <div style={{ position: 'absolute', right: -120, top: -120, width: 520, height: 520, borderRadius: '50%', backgroundColor: charte.bleuGris, opacity: 0.6 }} />
    <div style={{ position: 'absolute', right: 0, bottom: 0, width: 0, height: 0, borderBottom: `320px solid ${charte.bleu}`, borderLeft: '320px solid transparent' }} />
  </>
);

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

// Accroche en capitales, bleue avec un halo blanc (elle reste lisible là où la pose passe dessous).
export const Accroche: FC<{ texte: string; largeur: number; tailleMax?: number; facteur?: number }> = ({ texte, largeur, tailleMax = Infinity, facteur = 1 }) => (
  <div
    style={{
      fontSize: Math.min(tailleMax, tailleAccroche(texte, largeur)) * facteur, fontWeight: 800, lineHeight: 1.05, textTransform: 'uppercase',
      color: charte.bleu,
      textShadow: '0 0 4px rgba(255, 255, 255, 1), 0 0 10px rgba(255, 255, 255, 1), 0 0 22px rgba(255, 255, 255, 0.9)',
    }}
  >
    {texte}
  </div>
);

// Accroche en bandeau rouge, texte blanc : lisible sur n'importe quel fond.
export const Bandeau: FC<{ texte: string; largeur: number; tailleMax: number; facteur?: number }> = ({ texte, largeur, tailleMax, facteur = 1 }) => (
  <div
    style={{
      display: 'inline-block', maxWidth: largeur, padding: '10px 26px', backgroundColor: charte.rouge, color: charte.blanc,
      fontSize: Math.min(tailleMax, tailleAccroche(texte, largeur - 52)) * facteur, fontWeight: 800, lineHeight: 1.05, textTransform: 'uppercase',
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

// Capture nette en carte : cadre blanc, coins arrondis, ombre, légère inclinaison ; `style` la place, `recadrage`
// n'en garde qu'une zone.
export const CarteCapture: FC<{ url: string; largeur: number; hauteur: number; angle: number; style: CSSProperties; recadrage?: Recadrage | null }> = ({
  url, largeur, hauteur, angle, style, recadrage,
}) => (
  <div
    style={{
      position: 'absolute', width: largeur, height: hauteur, padding: 8, boxSizing: 'border-box', backgroundColor: charte.blanc,
      borderRadius: 14, boxShadow: '0 18px 40px rgba(0, 0, 0, 0.4)', transform: `rotate(${angle}deg)`, ...style,
    }}
  >
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: 8 }}>
      <Img src={url} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', ...styleRecadrage(recadrage ?? null) }} />
    </div>
  </div>
);

export const FACTEURS_ACCROCHE: Record<MiseEnPage['tailleAccroche'], number> = { petite: 0.8, normale: 1, grande: 1.2 };

// Zone de l'image gardée : l'image est agrandie puis décalée dans son cadre (overflow caché).
export function styleRecadrage(r: Recadrage | null): CSSProperties {
  if (!r) return {};
  return {
    width: `${10000 / r.largeur}%`, height: `${10000 / r.hauteur}%`, maxWidth: 'none',
    left: `${-(r.x * 100) / r.largeur}%`, top: `${-(r.y * 100) / r.hauteur}%`, position: 'absolute', objectFit: 'cover',
  };
}

// Pose à gauche : la place prévue à droite passe à gauche.
export function miroir(style: CSSProperties, cote: MiseEnPage['cotePose']): CSSProperties {
  if (cote === 'droite') return style;
  const { left, right, objectPosition, ...reste } = style;
  return {
    ...reste,
    ...(right !== undefined ? { left: right } : {}),
    ...(left !== undefined ? { right: left } : {}),
    ...(typeof objectPosition === 'string' ? { objectPosition: objectPosition.replace('right', 'left') } : {}),
  };
}

export function ordreVedette<T>(liste: T[], vedette: number | null): T[] {
  if (vedette === null || !liste[vedette]) return liste;
  return [liste[vedette]!, ...liste.filter((_, i) => i !== vedette)];
}

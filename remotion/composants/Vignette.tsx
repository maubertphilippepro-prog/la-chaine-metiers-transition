import type { FC } from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { tailleAccroche } from '../calculs';
import { charte } from '../charte';
import { police } from '../police';
import { LogoPMT } from './LogoPMT';

export const LARGEUR_VIGNETTE = 1280;
export const HAUTEUR_VIGNETTE = 720;

export type ProprietesVignette = {
  // Image du partage d'écran, ou null pour un fond aux formes de la charte.
  fondUrl: string | null;
  // Pose détourée (PNG transparent).
  poseUrl: string | null;
  accroche: string;
};

// Fond (écran flouté et assombri, ou formes de la charte), bande rouge, accroche en capitales à gauche,
// pose détourée en grand à droite, logo PMT en haut à gauche.
export const Vignette: FC<ProprietesVignette> = ({ fondUrl, poseUrl, accroche }) => (
  <AbsoluteFill style={{ backgroundColor: charte.blanc, fontFamily: police, overflow: 'hidden' }}>
    {fondUrl ? (
      <>
        <Img
          src={fondUrl}
          style={{ position: 'absolute', left: -20, top: -20, width: LARGEUR_VIGNETTE + 40, height: HAUTEUR_VIGNETTE + 40, objectFit: 'cover', filter: 'blur(6px)' }}
        />
        <AbsoluteFill style={{ backgroundColor: 'rgba(0, 28, 64, 0.55)' }} />
      </>
    ) : (
      <>
        <div style={{ position: 'absolute', right: -120, top: -120, width: 520, height: 520, borderRadius: '50%', backgroundColor: charte.bleuGris, opacity: 0.6 }} />
        <div style={{ position: 'absolute', right: 0, bottom: 0, width: 0, height: 0, borderBottom: `320px solid ${charte.bleu}`, borderLeft: '320px solid transparent' }} />
      </>
    )}
    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 28, backgroundColor: charte.rouge }} />
    {poseUrl && (
      <Img
        src={poseUrl}
        style={{ position: 'absolute', right: 0, bottom: 0, height: '100%', maxWidth: '55%', objectFit: 'contain', objectPosition: 'right bottom' }}
      />
    )}
    <div style={{ position: 'absolute', left: 64, top: 40 }}>
      <LogoPMT hauteur={72} />
    </div>
    <div style={{ position: 'absolute', left: 64, top: 150, bottom: 60, width: 640, display: 'flex', alignItems: 'center' }}>
      <div
        style={{
          fontSize: tailleAccroche(accroche), fontWeight: 800, lineHeight: 1.05, textTransform: 'uppercase',
          color: fondUrl ? charte.blanc : charte.bleu,
          textShadow: fondUrl ? '0 4px 18px rgba(0, 0, 0, 0.6)' : 'none',
        }}
      >
        {accroche}
      </div>
    </div>
  </AbsoluteFill>
);

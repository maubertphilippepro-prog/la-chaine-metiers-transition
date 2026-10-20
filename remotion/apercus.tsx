import type { FC } from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import type { ElementImages } from '../noyau/decisions';
import type { NatureElement, PositionEncart, Zone } from '../noyau/types';
import { camera, charte } from './charte';
import { Cadrage } from './composants/Cadrage';
import { EncartDefinition } from './composants/EncartDefinition';
import { Incrustation } from './composants/Incrustation';
import { LogoPMT } from './composants/LogoPMT';
import { police } from './police';

export const ApercuLogo: FC = () => (
  <AbsoluteFill style={{ backgroundColor: charte.blanc, alignItems: 'center', justifyContent: 'center' }}>
    <LogoPMT hauteur={240} />
  </AbsoluteFill>
);

// Fond bleu-gris pour simuler la vidéo derrière l'encart.
export const ApercuEncart: FC<{ terme: string; definition: string; position: PositionEncart; duree: number }> = props => (
  <AbsoluteFill style={{ backgroundColor: charte.bleuGris }}>
    <EncartDefinition {...props} />
  </AbsoluteFill>
);

const ZONE_DEMO: Zone = { x: 960, y: 405, largeur: 640, hauteur: 360 };

// Image fixe qui imite un partage d'écran : quadrillage, zone visée en bleu-gris, vignette caméra à sa place.
const FausseSource: FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: charte.blanc,
      backgroundImage: 'linear-gradient(#d5dde8 2px, transparent 2px), linear-gradient(90deg, #d5dde8 2px, transparent 2px)',
      backgroundSize: '120px 120px',
    }}
  >
    <div style={{ position: 'absolute', left: ZONE_DEMO.x, top: ZONE_DEMO.y, width: ZONE_DEMO.largeur, height: ZONE_DEMO.hauteur, backgroundColor: charte.bleuGris }} />
    <div
      style={{
        position: 'absolute', left: camera.x, top: camera.y, width: camera.largeur, height: camera.hauteur,
        backgroundColor: charte.bleu, color: charte.blanc, fontFamily: police, fontSize: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      Caméra
    </div>
  </AbsoluteFill>
);

export function elementDemo(nature: NatureElement, duree: number): ElementImages {
  const place = { id: 'demo', debut: 0, duree };
  switch (nature) {
    case 'zoom': return { ...place, nature, zone: ZONE_DEMO };
    case 'miseEnAvant': return { ...place, nature, zone: ZONE_DEMO };
    case 'texte': return { ...place, nature, texte: 'Windows + V', position: 'haut-gauche' };
    case 'camera': return { ...place, nature };
  }
}

// Un élément seul sur la fausse source, avec le même cadrage que VideoMontee.
export const ApercuElement: FC<{ element: ElementImages }> = ({ element }) => (
  <AbsoluteFill>
    <Cadrage elements={[element]} couche={() => <FausseSource />} />
    <Sequence from={element.debut} durationInFrames={element.duree}>
      <Incrustation element={element} />
    </Sequence>
  </AbsoluteFill>
);

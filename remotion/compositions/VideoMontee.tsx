import type { FC } from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import type { Partie } from '../../noyau/decisions';
import { FRISE, HAUTEUR_LOGO_VIDEO } from '../charte';
import { Cadrage } from '../composants/Cadrage';
import { CoucheVideo } from '../composants/CoucheVideo';
import { EncartDefinition } from '../composants/EncartDefinition';
import { Frise } from '../composants/Frise';
import { Incrustation } from '../composants/Incrustation';
import { LogoPMT } from '../composants/LogoPMT';

// Segments conservés de source.mp4 bout à bout (jump cuts) plein cadre, cadrés par les zooms et la caméra en grand ;
// mises en avant et textes incrustés au-dessus ; frise en bas, encarts aux temps décidés, logo collé au coin bas droit.
export const VideoMontee: FC<{ partie: Partie; sourceUrl: string; fondu: number }> = ({ partie, sourceUrl, fondu }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Cadrage
        elements={partie.elements}
        couche={muette => <CoucheVideo segments={partie.segments} sourceUrl={sourceUrl} fondu={fondu} muette={muette} />}
      />
      {partie.elements.map(e => (
        <Sequence key={e.id} from={e.debut} durationInFrames={e.duree} premountFor={fps}>
          <Incrustation element={e} />
        </Sequence>
      ))}
      <Frise epaisseur={FRISE} />
      {partie.encarts.map(e => (
        <Sequence key={`${e.terme}-${e.debut}`} from={e.debut} durationInFrames={e.duree} premountFor={fps}>
          <EncartDefinition terme={e.terme} definition={e.definition} position={e.position} duree={e.duree} />
        </Sequence>
      ))}
      <div style={{ position: 'absolute', right: 0, bottom: 0 }}>
        <LogoPMT hauteur={HAUTEUR_LOGO_VIDEO} arrondi={false} />
      </div>
    </AbsoluteFill>
  );
};

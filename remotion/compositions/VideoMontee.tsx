import { Video } from '@remotion/media';
import type { FC } from 'react';
import { AbsoluteFill, Sequence, Series, useVideoConfig } from 'remotion';
import type { Partie } from '../../noyau/decisions';
import { volumeRaccord } from '../calculs';
import { FRISE, HAUTEUR_LOGO_VIDEO } from '../charte';
import { EncartDefinition } from '../composants/EncartDefinition';
import { Frise } from '../composants/Frise';
import { LogoPMT } from '../composants/LogoPMT';

// Segments conservés de source.mp4 bout à bout (jump cuts) plein cadre, frise en bas, logo collé au coin bas droit,
// encarts aux temps décidés.
export const VideoMontee: FC<{ partie: Partie; sourceUrl: string; fondu: number }> = ({ partie, sourceUrl, fondu }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: 'black' }}>
        <Series>
          {partie.segments.map(s => (
            <Series.Sequence key={s.debut} durationInFrames={s.fin - s.debut} premountFor={fps}>
              <Video
                src={sourceUrl}
                trimBefore={s.debut}
                trimAfter={s.fin}
                volume={f => volumeRaccord(f, s.fin - s.debut, fondu)}
                objectFit="cover"
                style={{ width: '100%', height: '100%' }}
              />
            </Series.Sequence>
          ))}
        </Series>
      </AbsoluteFill>
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

import { Video } from '@remotion/media';
import type { FC } from 'react';
import { AbsoluteFill, Sequence, Series, useCurrentFrame, useVideoConfig } from 'remotion';
import type { EncartImages, Partie } from '../../noyau/decisions';
import { decalageLogo, volumeRaccord } from '../calculs';
import { EncartDefinition } from '../composants/EncartDefinition';
import { LogoPMT } from '../composants/LogoPMT';

const LogoCoin: FC<{ encarts: EncartImages[] }> = ({ encarts }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', top: 40, right: 40, transform: `translateY(${decalageLogo(frame, encarts)}px)` }}>
      <LogoPMT taille={110} />
    </div>
  );
};

// Segments conservés de source.mp4 bout à bout (jump cuts), logo en continu, encarts aux temps décidés.
export const VideoMontee: FC<{ partie: Partie; sourceUrl: string; fondu: number }> = ({ partie, sourceUrl, fondu }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Series>
        {partie.segments.map(s => (
          <Series.Sequence key={s.debut} durationInFrames={s.fin - s.debut} premountFor={fps}>
            <Video
              src={sourceUrl}
              trimBefore={s.debut}
              trimAfter={s.fin}
              volume={f => volumeRaccord(f, s.fin - s.debut, fondu)}
              style={{ width: '100%', height: '100%' }}
            />
          </Series.Sequence>
        ))}
      </Series>
      {partie.encarts.map(e => (
        <Sequence key={`${e.terme}-${e.debut}`} from={e.debut} durationInFrames={e.duree} premountFor={fps}>
          <EncartDefinition terme={e.terme} definition={e.definition} position={e.position} duree={e.duree} />
        </Sequence>
      ))}
      <LogoCoin encarts={partie.encarts} />
    </AbsoluteFill>
  );
};

import { Video } from '@remotion/media';
import type { FC } from 'react';
import { AbsoluteFill, Series, useVideoConfig } from 'remotion';
import type { SegmentImages } from '../../noyau/images';
import { volumeRaccord } from '../calculs';

// Segments conservés de source.mp4 bout à bout (jump cuts), plein cadre. Une copie muette sert à redessiner
// la vignette caméra par-dessus un zoom ou à l'agrandir.
export const CoucheVideo: FC<{ segments: SegmentImages[]; sourceUrl: string; fondu: number; muette?: boolean }> = ({
  segments, sourceUrl, fondu, muette = false,
}) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Series>
        {segments.map(s => (
          <Series.Sequence key={s.debut} durationInFrames={s.fin - s.debut} premountFor={fps}>
            <Video
              src={sourceUrl}
              trimBefore={s.debut}
              trimAfter={s.fin}
              volume={muette ? 0 : f => volumeRaccord(f, s.fin - s.debut, fondu)}
              objectFit="cover"
              style={{ width: '100%', height: '100%' }}
            />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};

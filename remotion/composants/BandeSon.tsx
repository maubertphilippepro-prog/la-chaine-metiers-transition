import { Audio } from '@remotion/media';
import type { FC } from 'react';
import { Sequence, staticFile, useVideoConfig } from 'remotion';
import { audio } from '../charte';
import { volumeTapis } from '../calculs';

// Jingle sur le générique, tapis sonore discret en boucle jusqu'à la fin.
export const BandeSon: FC<{ duree: number; generique: number }> = ({ duree, generique }) => {
  const { fps } = useVideoConfig();
  const debutTapis = Math.max(0, generique - fps);
  return (
    <>
      <Audio src={staticFile(audio.jingle)} volume={audio.volumeJingle} />
      <Sequence from={debutTapis} durationInFrames={Math.max(1, duree - debutTapis)}>
        <Audio
          src={staticFile(audio.tapis)}
          loop
          volume={f => volumeTapis(f, duree - debutTapis, fps, audio.volumeTapis)}
        />
      </Sequence>
    </>
  );
};

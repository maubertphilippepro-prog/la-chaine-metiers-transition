import { Player, type PlayerRef } from '@remotion/player';
import { type FC, useEffect, useRef } from 'react';
import { dureeEpisode, dureeVideoComplete, type DecisionsEpisode, type DecisionsVideoComplete } from '../../../noyau/decisions';
import { HAUTEUR, LARGEUR } from '../../../remotion/charte';
import { Episode } from '../../../remotion/compositions/Episode';
import { VideoComplete } from '../../../remotion/compositions/VideoComplete';

export type Vue = 'complete' | number;

// Le jeton change à chaque demande, même pour la même image.
export interface DemandeLecture {
  image: number;
  jeton: number;
}

interface Props {
  episodes: DecisionsEpisode[];
  complete: DecisionsVideoComplete;
  vue: Vue;
  onVue: (vue: Vue) => void;
  demande: DemandeLecture | null;
}

// Lecteur Remotion sur les compositions de rendu, recalculé à chaque modification du montage.
export const Apercu: FC<Props> = ({ episodes, complete, vue, onVue, demande }) => {
  const ref = useRef<PlayerRef>(null);
  useEffect(() => {
    if (!demande || !ref.current) return;
    ref.current.seekTo(demande.image);
    ref.current.play();
  }, [demande]);

  const episode = typeof vue === 'number' ? episodes[vue] : undefined;
  const style = { width: '100%' };
  return (
    <section className="panneau">
      <div className="vues">
        <button className={episode ? '' : 'actif'} onClick={() => onVue('complete')}>Vidéo complète</button>
        {episodes.map((e, i) => (
          <button key={i} className={episode && vue === i ? 'actif' : ''} onClick={() => onVue(i)}>
            {i + 1}. {e.titre}
          </button>
        ))}
      </div>
      {episode ? (
        <Player
          key={`episode-${vue}`}
          ref={ref}
          component={Episode}
          inputProps={{ decisions: episode }}
          durationInFrames={Math.max(1, dureeEpisode(episode))}
          fps={episode.fps}
          compositionWidth={LARGEUR}
          compositionHeight={HAUTEUR}
          controls
          style={style}
        />
      ) : (
        <Player
          key="complete"
          ref={ref}
          component={VideoComplete}
          inputProps={{ decisions: complete }}
          durationInFrames={Math.max(1, dureeVideoComplete(complete))}
          fps={complete.fps}
          compositionWidth={LARGEUR}
          compositionHeight={HAUTEUR}
          controls
          style={style}
        />
      )}
    </section>
  );
};

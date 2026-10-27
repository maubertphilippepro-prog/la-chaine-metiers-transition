import { Player, type PlayerRef } from '@remotion/player';
import { type FC, useEffect, useMemo, useRef } from 'react';
import { instantEpisode, instantVideoComplete } from '../logique/apercu';
import { dureeEpisode, dureeVideoComplete, type DecisionsEpisode, type DecisionsVideoComplete } from '../../../noyau/decisions';
import type { Zone } from '../../../noyau/types';
import { HAUTEUR, LARGEUR } from '../../../remotion/charte';
import { Episode } from '../../../remotion/compositions/Episode';
import { VideoComplete } from '../../../remotion/compositions/VideoComplete';
import { type Dessin, TraceurZone } from './TraceurZone';

export type Vue = 'complete' | number;

// `lire` lance la lecture, `pause` arrête l'aperçu sur l'image (tracé d'une zone), `caler` déplace l'aperçu sans
// changer son état (clic dans le texte).
export type ModeLecture = 'lire' | 'pause' | 'caler';

// Le jeton change à chaque demande, même pour la même image.
export interface DemandeLecture {
  // Sans image (rien de conservé à cet instant), la demande ne fait que mettre en pause.
  image?: number;
  jeton: number;
  mode: ModeLecture;
}

interface Props {
  episodes: DecisionsEpisode[];
  complete: DecisionsVideoComplete;
  vue: Vue;
  onVue: (vue: Vue) => void;
  demande: DemandeLecture | null;
  dessin: Dessin | null;
  largeurMin: number;
  validerDessin: (zone: Zone) => string | null;
  onFinDessin: () => void;
  // Instant de la source sous l'image affichée (null hors des parties), à chaque image lue ou calée.
  onInstant: (t: number | null) => void;
}

const STYLE = { width: '100%' };

// Lecteur Remotion sur les compositions de rendu, recalculé à chaque modification du montage.
export const Apercu: FC<Props> = ({ episodes, complete, vue, onVue, demande, dessin, largeurMin, validerDessin, onFinDessin, onInstant }) => {
  const ref = useRef<PlayerRef>(null);
  useEffect(() => {
    if (!demande || !ref.current) return;
    if (demande.image !== undefined) ref.current.seekTo(demande.image);
    if (demande.mode === 'pause') ref.current.pause();
    else if (demande.mode === 'lire') ref.current.play();
  }, [demande]);

  const episode = typeof vue === 'number' ? episodes[vue] : undefined;
  const versSource = (image: number) => (episode ? instantEpisode(episode, image) : instantVideoComplete(complete, image));
  // Toujours le dernier rendu, sans se réabonner au lecteur à chaque modification du montage.
  const signaler = useRef((image: number) => onInstant(versSource(image)));
  signaler.current = image => onInstant(versSource(image));
  // Le lecteur change de clé avec la vue : on s'abonne à nouveau au nouveau lecteur.
  useEffect(() => {
    const lecteur = ref.current;
    if (!lecteur) return;
    const surImage = (e: { detail: { frame: number } }) => signaler.current(e.detail.frame);
    lecteur.addEventListener('frameupdate', surImage);
    lecteur.addEventListener('seeked', surImage);
    signaler.current(lecteur.getCurrentFrame());
    return () => {
      lecteur.removeEventListener('frameupdate', surImage);
      lecteur.removeEventListener('seeked', surImage);
    };
  }, [vue]);
  // Propriétés stables tant que le montage ne change pas : le lecteur ne recalcule pas la composition pour rien.
  const proprietesEpisode = useMemo(() => (episode ? { decisions: episode } : null), [episode]);
  const proprietesComplete = useMemo(() => ({ decisions: complete }), [complete]);
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
      <div className="cadre-apercu">
        {proprietesEpisode && episode ? (
          <Player
            key={`episode-${vue}`}
            ref={ref}
            component={Episode}
            inputProps={proprietesEpisode}
            durationInFrames={Math.max(1, dureeEpisode(episode))}
            fps={episode.fps}
            compositionWidth={LARGEUR}
            compositionHeight={HAUTEUR}
            controls
            style={STYLE}
          />
        ) : (
          <Player
            key="complete"
            ref={ref}
            component={VideoComplete}
            inputProps={proprietesComplete}
            durationInFrames={Math.max(1, dureeVideoComplete(complete))}
            fps={complete.fps}
            compositionWidth={LARGEUR}
            compositionHeight={HAUTEUR}
            controls
            style={STYLE}
          />
        )}
        {dessin && (
          <TraceurZone key={JSON.stringify(dessin)} dessin={dessin} largeurMin={largeurMin} valider={validerDessin} onFin={onFinDessin} />
        )}
      </div>
    </section>
  );
};

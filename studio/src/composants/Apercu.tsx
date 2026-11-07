import { Player, type PlayerRef } from '@remotion/player';
import { type FC, type PointerEvent as PE, useEffect, useMemo, useRef, useState } from 'react';
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
const CLE_VOLANT = 'apercu-volant';

function lireVolant(): { actif: boolean; position: { x: number; y: number } } {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_VOLANT) ?? 'null');
    if (v && typeof v.actif === 'boolean' && v.position) return v;
  } catch { /* stockage indisponible */ }
  return { actif: false, position: { x: 24, y: 24 } };
}

// Lecteur Remotion sur les compositions de rendu, recalculé à chaque modification du montage.
export const Apercu: FC<Props> = ({ episodes, complete, vue, onVue, demande, dessin, largeurMin, validerDessin, onFinDessin, onInstant }) => {
  const ref = useRef<PlayerRef>(null);
  useEffect(() => {
    if (!demande || !ref.current) return;
    if (demande.image !== undefined) ref.current.seekTo(demande.image);
    if (demande.mode === 'pause') ref.current.pause();
    else if (demande.mode === 'lire') ref.current.play();
  }, [demande]);

  // Espace : lecture/pause, sauf pendant une saisie.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const cible = e.target as HTMLElement | null;
      if (cible && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(cible.tagName))) return;
      e.preventDefault();
      ref.current?.toggle();
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, []);

  // Fenêtre volante : position mémorisée dans le navigateur.
  const [volant, setVolant] = useState<boolean>(() => lireVolant().actif);
  const [position, setPosition] = useState(() => lireVolant().position);
  useEffect(() => {
    try { localStorage.setItem(CLE_VOLANT, JSON.stringify({ actif: volant, position })); } catch { /* stockage indisponible */ }
  }, [volant, position]);
  const glisser = (e: PE<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    const depart = { x: e.clientX - position.x, y: e.clientY - position.y };
    const bouger = (m: PointerEvent) => setPosition({ x: Math.max(0, m.clientX - depart.x), y: Math.max(0, m.clientY - depart.y) });
    const lacher = () => { window.removeEventListener('pointermove', bouger); window.removeEventListener('pointerup', lacher); };
    window.addEventListener('pointermove', bouger);
    window.addEventListener('pointerup', lacher);
  };

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
    <section className={volant ? 'panneau apercu-volant' : 'panneau'} style={volant ? { left: position.x, top: position.y } : undefined}>
      <div className="barre-apercu" onPointerDown={volant ? glisser : undefined}>
        <span className="discret">{volant ? 'Aperçu — glisser pour déplacer' : 'Aperçu'}</span>
        <button onClick={() => setVolant(v => !v)}>{volant ? 'Ancrer' : 'Détacher'}</button>
      </div>
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

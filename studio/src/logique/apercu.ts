import type { DecisionsEpisode, DecisionsVideoComplete, Partie } from '../../../noyau/decisions';
import { monteVersSource, sourceVersMonte } from '../../../noyau/temps';
import type { Mot } from '../../../noyau/types';

export interface Position {
  partie: number;
  image: number;
}

// Partie et image (dans la partie) où l'on entend l'instant t de la source ; un instant coupé
// donne la suite conservée, null s'il n'y a plus rien après.
export function positionDansParties(parties: Partie[], t: number, fps: number): Position | null {
  const image = t * fps;
  for (let i = 0; i < parties.length; i++) {
    const segments = parties[i]!.segments;
    const dernier = segments[segments.length - 1];
    if (dernier && image < dernier.fin) return { partie: i, image: Math.floor(sourceVersMonte(image, segments) ?? 0) };
  }
  return null;
}

export function imageVideoComplete(d: DecisionsVideoComplete, p: Position): number {
  let image = d.durees.generique;
  for (let i = 0; i < p.partie; i++) image += d.parties[i]!.duree + d.durees.intertitre;
  return image + p.image;
}

export function imageEpisode(d: DecisionsEpisode, p: Position): number {
  return d.durees.generique + p.image;
}

// Juste avant l'image suivante, pour rester dans le segment de l'image.
const FIN_IMAGE = 0.999;

// Sens inverse : instant de la source (en secondes) à la fin de l'image `image` de la partie ; null hors de la
// partie. La fin, car un calage arrondit à l'image inférieure : son début tomberait juste avant le mot calé.
function instantDansPartie(partie: Partie, image: number, fps: number): number | null {
  if (image < 0 || image >= partie.duree) return null;
  const t = monteVersSource(image + FIN_IMAGE, partie.segments);
  return t === null ? null : t / fps;
}

// Instant de la source sous l'image de l'aperçu ; null pendant le générique, un intertitre ou le carton de fin.
export function instantVideoComplete(d: DecisionsVideoComplete, image: number): number | null {
  let reste = image - d.durees.generique;
  for (const partie of d.parties) {
    if (reste < partie.duree) return instantDansPartie(partie, reste, d.fps);
    reste -= partie.duree + d.durees.intertitre;
  }
  return null;
}

export function instantEpisode(d: DecisionsEpisode, image: number): number | null {
  return instantDansPartie(d.partie, image - d.durees.generique, d.fps);
}

// Mot prononcé à l'instant t, ou le dernier prononcé avant (entre deux mots) ; null avant le premier.
export function motA(mots: Mot[], t: number | null): number | null {
  if (t === null) return null;
  let bas = 0;
  let haut = mots.length - 1;
  let trouve: Mot | null = null;
  while (bas <= haut) {
    const m = (bas + haut) >> 1;
    if (mots[m]!.debut <= t) { trouve = mots[m]!; bas = m + 1; } else haut = m - 1;
  }
  return trouve?.id ?? null;
}

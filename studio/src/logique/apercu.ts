import type { DecisionsEpisode, DecisionsVideoComplete, Partie } from '../../../noyau/decisions';
import { sourceVersMonte } from '../../../noyau/temps';

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

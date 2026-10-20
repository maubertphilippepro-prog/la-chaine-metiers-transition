import type { Segment } from './types';

export function dureeMontee(segments: Segment[]): number {
  return segments.reduce((total, s) => total + (s.fin - s.debut), 0);
}

export function sourceVersMonte(t: number, segments: Segment[]): number | null {
  let cumul = 0;
  for (const s of segments) {
    if (t < s.debut) return cumul;
    if (t <= s.fin) return cumul + (t - s.debut);
    cumul += s.fin - s.debut;
  }
  return null;
}

export function monteVersSource(t: number, segments: Segment[]): number | null {
  let cumul = 0;
  for (const s of segments) {
    const longueur = s.fin - s.debut;
    if (t <= cumul + longueur) return s.debut + (t - cumul);
    cumul += longueur;
  }
  return null;
}

// Passage [debut, fin] de la source vu dans le montage : les morceaux coupés sont retirés, les autres
// mis bout à bout en une seule plage ; null s'il est entièrement coupé. Segments triés, en secondes ou en images.
export function plageMontee(debut: number, fin: number, segments: Segment[]): Segment | null {
  let cumul = 0;
  let plage: Segment | null = null;
  for (const s of segments) {
    const a = Math.max(debut, s.debut);
    const b = Math.min(fin, s.fin);
    if (b > a) plage = { debut: plage ? plage.debut : cumul + (a - s.debut), fin: cumul + (b - s.debut) };
    cumul += s.fin - s.debut;
  }
  return plage;
}

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

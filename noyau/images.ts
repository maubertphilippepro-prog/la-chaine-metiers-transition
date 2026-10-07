import type { Segment } from './types';

// Positions en images ; `fin` est exclue.
export interface SegmentImages {
  debut: number;
  fin: number;
}

export function enImages(secondes: number, fps: number): number {
  return Math.round(secondes * fps);
}

export function segmentsEnImages(segments: Segment[], fps: number): SegmentImages[] {
  return segments
    .map(s => ({ debut: enImages(s.debut, fps), fin: enImages(s.fin, fps) }))
    .filter(s => s.fin > s.debut);
}

export function dureeImages(segments: SegmentImages[]): number {
  return segments.reduce((total, s) => total + (s.fin - s.debut), 0);
}

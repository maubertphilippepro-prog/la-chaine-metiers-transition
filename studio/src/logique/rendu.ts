import type { Cible } from '../../../remotion/scripts/rendu';

// Cible à relancer pour un fichier de rendu : episode-02-….mp4 → 2, video-complete.mp4 → complete.
export function cibleDuFichier(fichier: string): Cible | null {
  if (fichier === 'video-complete.mp4') return 'complete';
  const m = /^episode-(\d+)-/.exec(fichier);
  return m ? Number(m[1]) : null;
}

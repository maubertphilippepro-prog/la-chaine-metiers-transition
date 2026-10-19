import { type ReactNode, useCallback, useRef } from 'react';

const MARGE = 0.3;

// Écoute d'un passage de source.mp4 (coupé ou non) avant de décider, sans passer par l'aperçu monté.
export function useEcoute(sourceUrl: string | null): { ecouter: (debut: number, fin: number) => void; audio: ReactNode } {
  const ref = useRef<HTMLAudioElement>(null);
  const arret = useRef(0);

  const ecouter = useCallback((debut: number, fin: number) => {
    const a = ref.current;
    if (!a) return;
    arret.current = fin + MARGE;
    a.currentTime = Math.max(0, debut - MARGE);
    a.play().catch(() => {});
  }, []);

  const audio = sourceUrl ? (
    <audio
      ref={ref}
      src={sourceUrl}
      preload="metadata"
      onTimeUpdate={e => {
        if (e.currentTarget.currentTime >= arret.current) e.currentTarget.pause();
      }}
    />
  ) : null;

  return { ecouter, audio };
}

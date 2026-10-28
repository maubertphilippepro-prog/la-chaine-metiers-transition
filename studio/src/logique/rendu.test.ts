import { describe, expect, it } from 'vitest';
import { cibleDeSelection, cibleDuFichier } from './rendu';
import type { Video } from '../../../remotion/scripts/rendu';

describe('cibleDuFichier', () => {
  it('retrouve l’épisode ou la vidéo complète à relancer', () => {
    expect(cibleDuFichier('episode-02-windows-v.mp4')).toBe(2);
    expect(cibleDuFichier('video-complete.mp4')).toBe('complete');
    expect(cibleDuFichier('journal.txt')).toBeNull();
  });
});

describe('cibleDeSelection', () => {
  const toutes: Video[] = ['complete', 1, 2];
  it('demande tout quand chaque vidéo est cochée', () => {
    expect(cibleDeSelection(toutes, [])).toBe('tout');
  });
  it('garde les vidéos cochées dans l’ordre du tournage', () => {
    expect(cibleDeSelection(toutes, [1])).toEqual(['complete', 2]);
  });
  it('ne demande rien quand tout est décoché', () => {
    expect(cibleDeSelection(toutes, ['complete', 1, 2])).toBeNull();
  });
});

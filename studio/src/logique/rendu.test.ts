import { describe, expect, it } from 'vitest';
import { cibleDuFichier } from './rendu';

describe('cibleDuFichier', () => {
  it('retrouve l’épisode ou la vidéo complète à relancer', () => {
    expect(cibleDuFichier('episode-02-windows-v.mp4')).toBe(2);
    expect(cibleDuFichier('video-complete.mp4')).toBe('complete');
    expect(cibleDuFichier('journal.txt')).toBeNull();
  });
});

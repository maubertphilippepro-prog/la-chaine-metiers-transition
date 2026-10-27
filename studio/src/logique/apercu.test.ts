import { describe, expect, it } from 'vitest';
import type { DecisionsEpisode, DecisionsVideoComplete, Partie } from '../../../noyau/decisions';
import { dureeImages, type SegmentImages } from '../../../noyau/images';
import type { Mot } from '../../../noyau/types';
import {
  imageEpisode, imageVideoComplete, instantEpisode, instantVideoComplete, motA, positionDansParties,
} from './apercu';

const partie = (segments: SegmentImages[]): Partie => ({
  titre: 't', segments, encarts: [], encartsRetires: [], elements: [], duree: dureeImages(segments),
});
// À 30 images/s : la partie 1 garde 0–1 s et 2–3 s de la source, la partie 2 garde 4–5 s.
const p1 = partie([{ debut: 0, fin: 30 }, { debut: 60, fin: 90 }]);
const p2 = partie([{ debut: 120, fin: 150 }]);
const durees = { generique: 120, intertitre: 60, cartonFin: 150, fonduAudio: 1 };

describe('positionDansParties', () => {
  it('trouve la partie et l’image où l’on entend un instant de la source', () => {
    expect(positionDansParties([p1, p2], 0.5, 30)).toEqual({ partie: 0, image: 15 });
    expect(positionDansParties([p1, p2], 2.5, 30)).toEqual({ partie: 0, image: 45 });
    expect(positionDansParties([p1, p2], 4.5, 30)).toEqual({ partie: 1, image: 15 });
  });
  it('renvoie la suite conservée pour un instant coupé, null après la fin', () => {
    expect(positionDansParties([p1, p2], 1.5, 30)).toEqual({ partie: 0, image: 30 });
    expect(positionDansParties([p1, p2], 3.5, 30)).toEqual({ partie: 1, image: 0 });
    expect(positionDansParties([p1, p2], 6, 30)).toBeNull();
  });
});

describe('images de l’aperçu', () => {
  it('ajoute générique, parties précédentes et intertitres dans la vidéo complète', () => {
    const d: DecisionsVideoComplete = { fps: 30, sourceUrl: '', titre: 'T', parties: [p1, p2], durees };
    expect(imageVideoComplete(d, { partie: 0, image: 15 })).toBe(135);
    expect(imageVideoComplete(d, { partie: 1, image: 15 })).toBe(120 + 60 + 60 + 15);
  });
  it('ajoute le générique dans un épisode', () => {
    const d: DecisionsEpisode = { fps: 30, sourceUrl: '', titre: 'T', partie: p2, durees };
    expect(imageEpisode(d, { partie: 1, image: 15 })).toBe(135);
  });
});

describe('instant de la source sous l’aperçu', () => {
  const complete: DecisionsVideoComplete = { fps: 30, sourceUrl: '', titre: 'T', parties: [p1, p2], durees };
  it('retrouve l’instant de la source à la fin de l’image, null hors des parties', () => {
    expect(instantVideoComplete(complete, 0)).toBeNull();
    expect(instantVideoComplete(complete, 135)).toBeCloseTo(15.999 / 30);
    expect(instantVideoComplete(complete, 120 + 45)).toBeCloseTo(75.999 / 30);
    expect(instantVideoComplete(complete, 120 + 60 + 30)).toBeNull();
    expect(instantVideoComplete(complete, 120 + 60 + 60 + 15)).toBeCloseTo(135.999 / 30);
    expect(instantVideoComplete(complete, 120 + 60 + 60 + 30)).toBeNull();
  });
  it('retrouve l’instant de la source dans un épisode', () => {
    const d: DecisionsEpisode = { fps: 30, sourceUrl: '', titre: 'T', partie: p2, durees };
    expect(instantEpisode(d, 100)).toBeNull();
    expect(instantEpisode(d, 135)).toBeCloseTo(135.999 / 30);
    expect(instantEpisode(d, 150)).toBeNull();
  });
  it('retombe sur le mot calé malgré l’arrondi à l’image inférieure', () => {
    const d: DecisionsEpisode = { fps: 30, sourceUrl: '', titre: 'T', partie: p2, durees };
    const mots: Mot[] = [{ id: 1, texte: 'a', debut: 4.0, fin: 4.49 }, { id: 2, texte: 'b', debut: 4.49, fin: 4.9 }];
    const p = positionDansParties([p2], 4.49, 30)!;
    expect(motA(mots, instantEpisode(d, imageEpisode(d, p)))).toBe(2);
  });
  it('donne le mot en cours, ou le dernier prononcé entre deux mots', () => {
    const mots: Mot[] = [
      { id: 7, texte: 'a', debut: 1, fin: 1.5 },
      { id: 8, texte: 'b', debut: 2, fin: 2.5 },
    ];
    expect(motA(mots, 0.5)).toBeNull();
    expect(motA(mots, 1.2)).toBe(7);
    expect(motA(mots, 1.8)).toBe(7);
    expect(motA(mots, 9)).toBe(8);
    expect(motA(mots, null)).toBeNull();
  });
});

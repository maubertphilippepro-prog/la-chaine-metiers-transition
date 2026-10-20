import { describe, expect, it } from 'vitest';
import type { DecisionsEpisode, DecisionsVideoComplete, Partie } from '../../../noyau/decisions';
import { dureeImages, type SegmentImages } from '../../../noyau/images';
import { imageEpisode, imageVideoComplete, positionDansParties } from './apercu';

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

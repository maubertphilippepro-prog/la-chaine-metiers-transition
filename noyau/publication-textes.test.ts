import { describe, expect, it } from 'vitest';
import type { DecisionsVideoComplete, Partie } from './decisions';
import { chapitresYoutube, descriptionYoutube, formatHorodatage, segmentsSecondes, texteConserve } from './publication-textes';

const FPS = 30;
const partie = (titre: string, secondes: number): Partie => ({
  titre, segments: [{ debut: 0, fin: secondes * FPS }], encarts: [], encartsRetires: [], elements: [], duree: secondes * FPS,
});
// Générique 4 s, intertitre 2 s, carton de fin 5 s.
const decisions = (durees: number[]): DecisionsVideoComplete => ({
  fps: FPS, sourceUrl: '', titre: 'T',
  parties: durees.map((d, i) => partie(`Chapitre ${i + 1}`, d)),
  durees: { generique: 120, intertitre: 60, cartonFin: 150, fonduAudio: 1 },
});

describe('chapitresYoutube', () => {
  it('place chaque chapitre au début de son intertitre, le premier à 0', () => {
    expect(chapitresYoutube(decisions([20, 30, 40]))).toEqual([
      { titre: 'Chapitre 1', debut: 0 }, { titre: 'Chapitre 2', debut: 24 }, { titre: 'Chapitre 3', debut: 56 },
    ]);
  });
  it('n’en donne aucun avec moins de trois chapitres', () => {
    expect(chapitresYoutube(decisions([20, 30]))).toEqual([]);
  });
  it('n’en donne aucun si un chapitre dure moins de 10 s', () => {
    expect(chapitresYoutube(decisions([20, 5, 40]))).toEqual([]);
  });
});

describe('formatHorodatage', () => {
  it('écrit m:ss, ou h:mm:ss au-delà d’une heure', () => {
    expect(formatHorodatage(0)).toBe('0:00');
    expect(formatHorodatage(65.9)).toBe('1:05');
    expect(formatHorodatage(3725)).toBe('1:02:05');
  });
});

describe('descriptionYoutube', () => {
  it('ajoute la liste des chapitres', () => {
    expect(descriptionYoutube('Desc\n', chapitresYoutube(decisions([20, 30, 40])))).toBe(
      'Desc\n\nChapitres :\n0:00 Chapitre 1\n0:24 Chapitre 2\n0:56 Chapitre 3',
    );
  });
  it('laisse la description seule sans chapitres', () => {
    expect(descriptionYoutube(' Desc ', [])).toBe('Desc');
  });
});

describe('paroles conservées', () => {
  it('convertit les segments en secondes et garde les mots dont le milieu est conservé', () => {
    const segments = segmentsSecondes({ ...partie('A', 0), segments: [{ debut: 0, fin: 30 }, { debut: 90, fin: 150 }] }, FPS);
    expect(segments).toEqual([{ debut: 0, fin: 1 }, { debut: 3, fin: 5 }]);
    const mots = [
      { id: 0, texte: 'Bonjour', debut: 0.2, fin: 0.6 },
      { id: 1, texte: 'euh', debut: 1.5, fin: 2 },
      { id: 2, texte: 'voici', debut: 3.1, fin: 3.5 },
    ];
    expect(texteConserve(mots, segments)).toBe('Bonjour voici');
  });
});

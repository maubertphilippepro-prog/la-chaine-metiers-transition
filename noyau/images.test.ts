import { describe, expect, it } from 'vitest';
import { dureeImages, enImages, segmentsEnImages, versImages } from './images';
import { nomFichierEpisode, slug } from './nommage';

describe('images', () => {
  it("arrondit à l'image la plus proche", () => {
    expect(enImages(1.5, 30)).toBe(45);
    expect(enImages(0.016, 30)).toBe(0);
    expect(enImages(0.017, 30)).toBe(1);
  });
  it('convertit sans arrondir pour les positions intermédiaires', () => {
    expect(versImages(1.25, 30)).toBe(37.5);
    expect(versImages(0.016, 30)).toBeCloseTo(0.48);
  });
  it('convertit les segments et retire ceux de durée nulle', () => {
    expect(segmentsEnImages([{ debut: 0, fin: 2 }, { debut: 3, fin: 3.01 }, { debut: 4, fin: 5.5 }], 30))
      .toEqual([{ debut: 0, fin: 60 }, { debut: 120, fin: 165 }]);
  });
  it('additionne les durées', () => {
    expect(dureeImages([{ debut: 0, fin: 60 }, { debut: 120, fin: 165 }])).toBe(105);
  });
});

describe('nommage', () => {
  it('fabrique un slug sans accents ni ponctuation', () => {
    expect(slug('Windows + V : retrouvez tout votre historique !')).toBe('windows-v-retrouvez-tout-votre-historique');
    expect(slug("Été à l'IA")).toBe('ete-a-l-ia');
  });
  it('limite la longueur et gère le vide', () => {
    expect(slug('a'.repeat(80))).toHaveLength(60);
    expect(slug('!!!')).toBe('sans-titre');
  });
  it("numérote les fichiers d'épisode", () => {
    expect(nomFichierEpisode(0, 'There : exportez en Markdown')).toBe('episode-01-there-exportez-en-markdown.mp4');
    expect(nomFichierEpisode(11, 'X')).toBe('episode-12-x.mp4');
  });
});

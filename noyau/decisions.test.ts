import { describe, expect, it } from 'vitest';
import reglagesJson from '../reglages.json';
import {
  construirePartie, decisionsEpisodes, decisionsVideoComplete, dureeEpisode, dureesHabillage, dureeVideoComplete,
} from './decisions';
import type { Analyse, Montage, Reglages, Terme, Zone } from './types';

const r: Reglages = {
  ...reglagesJson,
  coupe: { silenceConserve: 0.3, margeMots: 0.06, dureeMinCoupe: 0.1, dureeMinSegment: 0.05, fonduAudio: 0.015 },
  durees: { generique: 4, encart: 6, intertitre: 2, cartonFin: 5 },
};
const FPS = 10;
const analyse: Analyse = {
  version: 1, duree: 20, fps: FPS, mots: [], detections: [], suggestions: null, erreurSuggestions: null,
};
const terme = (p: Partial<Terme>): Terme => ({
  terme: 'API', definition: 'Interface.', occurrences: [], statut: 'valide', position: 'bas', ...p,
});
const montage: Montage = {
  version: 1,
  titre: 'Vidéo test',
  coupes: [{ id: 'm0', type: 'manuelle', debut: 2, fin: 4, active: true }],
  chapitres: [{ titre: 'A', debut: 0 }, { titre: 'B', debut: 10 }],
  termes: [terme({ terme: 'API', occurrences: [5, 15] }), terme({ terme: 'SSO', occurrences: [12] })],
  elements: [],
};

describe('dureesHabillage', () => {
  it('convertit les durées des réglages en images, fondu d\'au moins une image', () => {
    expect(dureesHabillage(r, FPS)).toEqual({ generique: 40, intertitre: 20, cartonFin: 50, fonduAudio: 1 });
  });
});

describe('construirePartie', () => {
  it("raccourcit l'encart si la partie est plus courte que lui", () => {
    const p = construirePartie('X', [{ debut: 0, fin: 30 }], [terme({ occurrences: [1] })], 60, FPS);
    expect(p.encarts).toEqual([{ terme: 'API', definition: 'Interface.', position: 'bas', debut: 0, duree: 30 }]);
  });
  it("signale le second terme quand la partie est plus courte qu'un encart", () => {
    const p = construirePartie('X', [{ debut: 0, fin: 30 }], [terme({ occurrences: [1] }), terme({ terme: 'SSO', occurrences: [2] })], 60, FPS);
    expect(p.encarts.map(e => e.terme)).toEqual(['API']);
    expect(p.encartsRetires).toEqual(['SSO']);
  });
  it('ignore les termes non validés', () => {
    const p = construirePartie('X', [{ debut: 0, fin: 300 }], [terme({ statut: 'a-valider', occurrences: [1] })], 60, FPS);
    expect(p.encarts).toEqual([]);
  });
});

describe('decisionsEpisodes', () => {
  const [a, b] = decisionsEpisodes(analyse, montage, r, 'http://x/source.mp4');

  it('découpe les segments conservés par chapitre, en images', () => {
    expect(a!.partie.segments).toEqual([{ debut: 0, fin: 20 }, { debut: 40, fin: 100 }]);
    expect(a!.partie.duree).toBe(80);
    expect(b!.partie.segments).toEqual([{ debut: 100, fin: 200 }]);
  });
  it("place chaque terme à sa première occurrence dans l'épisode, sans dépasser la fin", () => {
    // API prononcé à 5 s → 30 images en temps monté, avancé à 20 pour finir avec la partie (80 − 60).
    expect(a!.partie.encarts).toEqual([{ terme: 'API', definition: 'Interface.', position: 'bas', debut: 20, duree: 60 }]);
    // B : SSO à 20 ; API (50, décalé à 80, avancé à 40) chevaucherait SSO → retiré.
    expect(b!.partie.encarts.map(e => [e.terme, e.debut])).toEqual([['SSO', 20]]);
    expect(b!.partie.encartsRetires).toEqual(['API']);
    expect(a!.partie.encartsRetires).toEqual([]);
  });
  it('reprend titre, source et durée totale', () => {
    expect(a!.titre).toBe('A');
    expect(a!.sourceUrl).toBe('http://x/source.mp4');
    expect(a!.fps).toBe(10);
    expect(dureeEpisode(a!)).toBe(40 + 80 + 50);
  });
  it('ignore un chapitre entièrement coupé', () => {
    const coupe: Montage = {
      ...montage,
      coupes: [...montage.coupes, { id: 'm1', type: 'manuelle', debut: 10, fin: 20, active: true }],
    };
    expect(decisionsEpisodes(analyse, coupe, r, '').map(e => e.titre)).toEqual(['A']);
  });
});

describe('decisionsVideoComplete', () => {
  const v = decisionsVideoComplete(analyse, montage, r, 'http://x/source.mp4');

  it("ne définit un terme qu'à sa première occurrence dans la vidéo", () => {
    expect(v.parties.map(p => p.encarts.map(e => e.terme))).toEqual([['API'], ['SSO']]);
  });
  it('prend le titre du montage et compte un intertitre entre deux chapitres', () => {
    expect(v.titre).toBe('Vidéo test');
    expect(dureeVideoComplete(v)).toBe(40 + 80 + 20 + 100 + 50);
  });
});

describe('éléments à l’écran', () => {
  const ZONE: Zone = { x: 480, y: 270, largeur: 960, hauteur: 540 };
  // Coupe 2–4 s ; chapitre A : images 0–20 et 40–100 ; chapitre B : 100–200.
  const avecElements: Montage = {
    ...montage,
    elements: [
      { id: 'e0', debut: 1, fin: 5, statut: 'valide', nature: 'texte', texte: 'Windows + V', position: 'haut-gauche' },
      { id: 'e1', debut: 8, fin: 12, statut: 'valide', nature: 'zoom', zone: ZONE },
      { id: 'e2', debut: 2.5, fin: 3.5, statut: 'valide', nature: 'camera' },
      { id: 'e3', debut: 6, fin: 7, statut: 'a-valider', nature: 'camera' },
      { id: 'e4', debut: 15, fin: 16, statut: 'valide', nature: 'miseEnAvant', zone: null },
    ],
  };

  it('place les éléments validés en images, coupes retirées et morceaux contigus fusionnés', () => {
    const [a, b] = decisionsEpisodes(analyse, avecElements, r, '');
    expect(a!.partie.elements).toEqual([
      { id: 'e0', debut: 10, duree: 20, nature: 'texte', texte: 'Windows + V', position: 'haut-gauche' },
      { id: 'e1', debut: 60, duree: 20, nature: 'zoom', zone: ZONE },
    ]);
    expect(b!.partie.elements).toEqual([{ id: 'e1', debut: 0, duree: 20, nature: 'zoom', zone: ZONE }]);
  });
  it('les reprend dans chaque partie de la vidéo complète', () => {
    const v = decisionsVideoComplete(analyse, avecElements, r, '');
    expect(v.parties.map(p => p.elements.map(e => e.id))).toEqual([['e0', 'e1'], ['e1']]);
  });
  it('n’en met aucun dans une partie construite sans éléments', () => {
    expect(construirePartie('X', [{ debut: 0, fin: 30 }], [], 60, FPS).elements).toEqual([]);
  });
});

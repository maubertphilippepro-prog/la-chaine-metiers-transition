import { describe, expect, it } from 'vitest';
import exemple from '../fixtures/analyse-exemple.json';
import { montageInitial } from './montage-initial';
import type { Analyse } from './types';

const analyse = exemple as Analyse;

describe('montageInitial', () => {
  const m = montageInitial(analyse, 'Épisode test');

  it('active les détections et ajoute les longueurs inactives', () => {
    expect(m.coupes).toEqual([
      { id: 'd0', type: 'silence', debut: 0, fin: 0.8, active: true },
      { id: 'd1', type: 'hesitation', debut: 1.8, fin: 3, active: true },
      { id: 'l0', type: 'longueur', debut: 10, fin: 20, active: false },
    ]);
  });
  it('désactive une hésitation où la réécoute a entendu des mots', () => {
    const avecParoles: Analyse = {
      ...analyse,
      detections: analyse.detections.map(d => (d.id === 'd1' ? { ...d, paroles: 'il y a' } : d)),
    };
    expect(montageInitial(avecParoles, 'x').coupes.map(c => [c.id, c.active])).toEqual([
      ['d0', true], ['d1', false], ['l0', false],
    ]);
  });
  it('force le premier chapitre à 0', () => {
    expect(m.chapitres).toEqual([
      { titre: 'Introduction', debut: 0 },
      { titre: 'Le SSO', debut: 3 },
    ]);
  });
  it('valide d\'office les termes du glossaire', () => {
    expect(m.termes.map(t => [t.terme, t.statut, t.position])).toEqual([
      ['SSO', 'a-valider', 'bas'],
      ['API', 'valide', 'bas'],
    ]);
  });
  it('crée un chapitre unique sans suggestions', () => {
    const sans = montageInitial({ ...analyse, suggestions: null }, 'Titre');
    expect(sans.chapitres).toEqual([{ titre: 'Titre', debut: 0 }]);
    expect(sans.termes).toEqual([]);
    expect(sans.coupes).toHaveLength(2);
  });
});

describe('montageInitial et analyse', () => {
  it('copie les occurrences des termes', () => {
    const a = structuredClone(analyse);
    const avant = structuredClone(a.suggestions!.termes[0]!.occurrences);
    montageInitial(a, 'T').termes[0]!.occurrences.push(999);
    expect(a.suggestions!.termes[0]!.occurrences).toEqual(avant);
  });
});

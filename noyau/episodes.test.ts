import { describe, expect, it } from 'vitest';
import { decouperSegments, placerEncarts, plagesEpisodes } from './episodes';
import type { Terme } from './types';

const terme = (p: Partial<Terme>): Terme => ({
  terme: 'API', definition: 'Interface de programmation.', occurrences: [],
  statut: 'valide', position: 'bas', ...p,
});

describe('plagesEpisodes', () => {
  it('découpe la durée selon les chapitres triés', () => {
    expect(plagesEpisodes([
      { titre: 'B', debut: 40 },
      { titre: 'A', debut: 0 },
    ], 100)).toEqual([
      { titre: 'A', debut: 0, fin: 40 },
      { titre: 'B', debut: 40, fin: 100 },
    ]);
  });
});

describe('decouperSegments', () => {
  it('garde l\'intersection avec la plage', () => {
    expect(decouperSegments(
      [{ debut: 0, fin: 10 }, { debut: 20, fin: 50 }, { debut: 60, fin: 70 }],
      { debut: 5, fin: 30 },
    )).toEqual([{ debut: 5, fin: 10 }, { debut: 20, fin: 30 }]);
  });
});

describe('placerEncarts', () => {
  const segments = [{ debut: 0, fin: 10 }, { debut: 20, fin: 40 }];

  it('place un terme validé à sa première occurrence conservée', () => {
    expect(placerEncarts([terme({ occurrences: [25, 30] })], segments, 6))
      .toEqual([{ terme: 'API', definition: 'Interface de programmation.', position: 'bas', debut: 15 }]);
  });
  it('ignore les occurrences coupées ou hors segments', () => {
    expect(placerEncarts([terme({ occurrences: [15, 35] })], segments, 6)[0]!.debut).toBe(25);
  });
  it('ignore les termes non validés', () => {
    expect(placerEncarts([
      terme({ statut: 'a-valider', occurrences: [1] }),
      terme({ statut: 'ecarte', occurrences: [2] }),
    ], segments, 6)).toEqual([]);
  });
  it('ignore un terme sans occurrence conservée', () => {
    expect(placerEncarts([terme({ occurrences: [15] })], segments, 6)).toEqual([]);
  });
  it('décale un encart qui chevaucherait le précédent', () => {
    const e = placerEncarts([
      terme({ terme: 'API', occurrences: [1] }),
      terme({ terme: 'SSO', occurrences: [3] }),
    ], segments, 6);
    expect(e.map(x => [x.terme, x.debut])).toEqual([['API', 1], ['SSO', 7]]);
  });
});

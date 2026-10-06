import { describe, expect, it } from 'vitest';
import { calculerSegments, intervalleACouper } from './segments';
import type { Coupe, ReglagesCoupe } from './types';

const r: ReglagesCoupe = {
  silenceConserve: 0.3,
  margeMots: 0.06,
  dureeMinCoupe: 0.1,
  dureeMinSegment: 0.05,
  fonduAudio: 0.015,
};

const coupe = (p: Partial<Coupe>): Coupe => ({
  id: 'c', type: 'manuelle', debut: 0, fin: 0, active: true, ...p,
});

const arrondir = (s: { debut: number; fin: number }[]) =>
  s.map(x => ({ debut: +x.debut.toFixed(3), fin: +x.fin.toFixed(3) }));

describe('intervalleACouper', () => {
  it('garde silenceConserve au total autour d\'un silence', () => {
    expect(intervalleACouper(coupe({ type: 'silence', debut: 2, fin: 3 }), r))
      .toEqual({ debut: 2.15, fin: 2.85 });
  });
  it('retire la marge de chaque côté d\'une hésitation', () => {
    const i = intervalleACouper(coupe({ type: 'hesitation', debut: 5, fin: 5.5 }), r)!;
    expect(+i.debut.toFixed(3)).toBe(5.06);
    expect(+i.fin.toFixed(3)).toBe(5.44);
  });
  it('coupe exactement une répétition', () => {
    expect(intervalleACouper(coupe({ type: 'repetition', debut: 1, fin: 1.8 }), r))
      .toEqual({ debut: 1, fin: 1.8 });
  });
  it('ignore une coupe devenue trop courte', () => {
    expect(intervalleACouper(coupe({ type: 'silence', debut: 2, fin: 2.35 }), r)).toBeNull();
  });
});

describe('calculerSegments', () => {
  it('sans coupe, renvoie toute la durée', () => {
    expect(calculerSegments(10, [], r)).toEqual([{ debut: 0, fin: 10 }]);
  });
  it('ignore les coupes inactives', () => {
    expect(calculerSegments(10, [coupe({ debut: 2, fin: 4, active: false })], r))
      .toEqual([{ debut: 0, fin: 10 }]);
  });
  it('fusionne les coupes qui se chevauchent', () => {
    const s = calculerSegments(10, [
      coupe({ id: 'a', debut: 2, fin: 4 }),
      coupe({ id: 'b', debut: 3, fin: 5 }),
    ], r);
    expect(s).toEqual([{ debut: 0, fin: 2 }, { debut: 5, fin: 10 }]);
  });
  it('trie les coupes et borne à la durée', () => {
    const s = calculerSegments(10, [
      coupe({ id: 'b', debut: 8, fin: 12 }),
      coupe({ id: 'a', debut: 1, fin: 2 }),
    ], r);
    expect(s).toEqual([{ debut: 0, fin: 1 }, { debut: 2, fin: 8 }]);
  });
  it('supprime les segments conservés trop courts', () => {
    const s = calculerSegments(10, [
      coupe({ id: 'a', debut: 2, fin: 4 }),
      coupe({ id: 'b', debut: 4.02, fin: 6 }),
    ], r);
    expect(s).toEqual([{ debut: 0, fin: 2 }, { debut: 6, fin: 10 }]);
  });
  it('combine silence et hésitation', () => {
    const s = calculerSegments(10, [
      coupe({ id: 's', type: 'silence', debut: 2, fin: 3 }),
      coupe({ id: 'h', type: 'hesitation', debut: 6, fin: 6.6 }),
    ], r);
    expect(arrondir(s)).toEqual([
      { debut: 0, fin: 2.15 },
      { debut: 2.85, fin: 6.06 },
      { debut: 6.54, fin: 10 },
    ]);
  });
});

describe('calculerSegments aux bords', () => {
  it('ne garde pas de marge de silence avant le début', () => {
    const s = calculerSegments(10, [coupe({ type: 'silence', debut: 0, fin: 0.8 })], r);
    expect(arrondir(s)).toEqual([{ debut: 0.65, fin: 10 }]);
  });
  it('ne garde pas de marge de silence après la fin', () => {
    const s = calculerSegments(10, [coupe({ type: 'silence', debut: 9, fin: 10 })], r);
    expect(arrondir(s)).toEqual([{ debut: 0, fin: 9.15 }]);
  });
  it('ne laisse pas de fragment entre une hésitation et un euh étendu', () => {
    const s = calculerSegments(10, [
      coupe({ id: 'h', type: 'hesitation', debut: 1.0, fin: 1.5 }),
      coupe({ id: 'e', type: 'hesitation', debut: 1.0, fin: 2.0 }),
    ], r);
    expect(arrondir(s)).toEqual([{ debut: 0, fin: 1.06 }, { debut: 1.94, fin: 10 }]);
  });
});

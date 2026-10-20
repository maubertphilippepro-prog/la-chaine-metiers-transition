import { describe, expect, it } from 'vitest';
import { dureeMontee, monteVersSource, plageMontee, sourceVersMonte } from './temps';

const segments = [
  { debut: 0, fin: 2 },
  { debut: 5, fin: 10 },
];

describe('temps', () => {
  it('calcule la durée montée', () => {
    expect(dureeMontee(segments)).toBe(7);
  });
  it('convertit un temps conservé', () => {
    expect(sourceVersMonte(1, segments)).toBe(1);
    expect(sourceVersMonte(6, segments)).toBe(3);
  });
  it('envoie un temps coupé au début du segment suivant', () => {
    expect(sourceVersMonte(3, segments)).toBe(2);
  });
  it('renvoie null après le dernier segment', () => {
    expect(sourceVersMonte(11, segments)).toBeNull();
  });
  it('convertit dans l\'autre sens', () => {
    expect(monteVersSource(1, segments)).toBe(1);
    expect(monteVersSource(3, segments)).toBe(6);
    expect(monteVersSource(8, segments)).toBeNull();
  });
});

describe('plageMontee', () => {
  const segments = [{ debut: 0, fin: 2 }, { debut: 4, fin: 10 }];

  it('retire les morceaux coupés et met bout à bout les morceaux conservés', () => {
    expect(plageMontee(1, 5, segments)).toEqual({ debut: 1, fin: 3 });
    expect(plageMontee(5, 20, segments)).toEqual({ debut: 3, fin: 8 });
  });
  it('renvoie null pour un passage entièrement coupé', () => {
    expect(plageMontee(2.5, 3.5, segments)).toBeNull();
  });
});

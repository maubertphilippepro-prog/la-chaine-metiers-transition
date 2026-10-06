import { describe, expect, it } from 'vitest';
import { dureeMontee, monteVersSource, sourceVersMonte } from './temps';

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

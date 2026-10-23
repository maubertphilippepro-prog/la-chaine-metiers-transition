import { describe, expect, it } from 'vitest';
import { simplifierTitre } from './nouveau-tournage';

describe('titre simplifié', () => {
  it('retire accents et ponctuation, en minuscules séparées par des tirets', () => {
    expect(simplifierTitre('Métiers & Transition : l’été !')).toBe('metiers-transition-l-ete');
    expect(simplifierTitre('  Manœuvre  ÉCLAIR  ')).toBe('manoeuvre-eclair');
  });
  it('garde 50 caractères au plus, sans tiret final', () => {
    expect(simplifierTitre(`${'a'.repeat(30)} ${'b'.repeat(30)}`)).toBe(`${'a'.repeat(30)}-${'b'.repeat(19)}`);
    expect(simplifierTitre(`${'a'.repeat(49)} b`)).toBe('a'.repeat(49));
  });
  it('se rabat sur « tournage » sans lettre ni chiffre', () => {
    expect(simplifierTitre('?!')).toBe('tournage');
  });
});

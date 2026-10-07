import { describe, expect, it } from 'vitest';
import { lireArguments } from './rendu';

describe('lireArguments', () => {
  it('lit le dossier et les options', () => {
    expect(lireArguments(['donnees/tournages/x'])).toEqual({ dossier: 'donnees/tournages/x', brouillon: false, cible: 'tout' });
    expect(lireArguments(['x', '--brouillon', '--seul', '2'])).toEqual({ dossier: 'x', brouillon: true, cible: 2 });
    expect(lireArguments(['--seul', 'complete', 'x'])).toEqual({ dossier: 'x', brouillon: false, cible: 'complete' });
  });
  it('refuse les arguments invalides', () => {
    expect(() => lireArguments([])).toThrow('Usage');
    expect(() => lireArguments(['x', '--seul', '0'])).toThrow('--seul');
    expect(() => lireArguments(['x', '--seul'])).toThrow('--seul');
    expect(() => lireArguments(['x', '--inconnu'])).toThrow('--inconnu');
  });
});

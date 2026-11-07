import { describe, expect, it } from 'vitest';
import { miroir, ordreVedette, styleRecadrage } from './briques';

describe('briques de mise en page', () => {
  it('ne touche à rien par défaut', () => {
    expect(styleRecadrage(null)).toEqual({});
    expect(miroir({ right: 0, maxWidth: '55%' }, 'droite')).toEqual({ right: 0, maxWidth: '55%' });
    expect(ordreVedette(['a', 'b'], null)).toEqual(['a', 'b']);
  });
  it('zoome sur la zone recadrée', () => {
    // Zone de 50 % en largeur et hauteur à partir du milieu : image doublée, décalée de moitié.
    expect(styleRecadrage({ x: 50, y: 50, largeur: 50, hauteur: 50 })).toEqual({
      width: '200%', height: '200%', maxWidth: 'none', left: '-100%', top: '-100%', position: 'absolute', objectFit: 'cover',
    });
  });
  it('passe la pose à gauche et met le logo vedette en tête', () => {
    expect(miroir({ right: 0, objectPosition: 'right bottom' }, 'gauche')).toEqual({ left: 0, objectPosition: 'left bottom' });
    expect(ordreVedette(['a', 'b', 'c'], 2)).toEqual(['c', 'a', 'b']);
  });
});

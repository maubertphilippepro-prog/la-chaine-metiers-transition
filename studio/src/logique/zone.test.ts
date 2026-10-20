import { describe, expect, it } from 'vitest';
import { rectangleTrace, versSource } from './zone';

describe('versSource', () => {
  const cadre = { left: 100, top: 50, width: 960, height: 540 };
  it('convertit un point de l’aperçu en pixels de la source', () => {
    expect(versSource(580, 320, cadre)).toEqual({ x: 960, y: 540 });
  });
  it('borne le point à l’image', () => {
    expect(versSource(0, 0, cadre)).toEqual({ x: 0, y: 0 });
    expect(versSource(2000, 2000, cadre)).toEqual({ x: 1920, y: 1080 });
  });
});

describe('rectangleTrace', () => {
  it('trace un rectangle libre pour une mise en avant', () => {
    expect(rectangleTrace({ x: 100, y: 200 }, { x: 50, y: 400 }, false, 480)).toEqual({ x: 50, y: 200, largeur: 50, hauteur: 200 });
  });
  it('garde le 16:9 pour un zoom, en suivant le geste le plus ample', () => {
    expect(rectangleTrace({ x: 100, y: 100 }, { x: 900, y: 200 }, true, 480)).toEqual({ x: 100, y: 100, largeur: 800, hauteur: 450 });
    expect(rectangleTrace({ x: 100, y: 100 }, { x: 200, y: 550 }, true, 480)).toEqual({ x: 100, y: 100, largeur: 800, hauteur: 450 });
  });
  it('ne descend pas sous la largeur minimale', () => {
    expect(rectangleTrace({ x: 100, y: 100 }, { x: 110, y: 105 }, true, 480)).toEqual({ x: 100, y: 100, largeur: 480, hauteur: 270 });
  });
  it('part vers le haut et la gauche quand le geste y va', () => {
    expect(rectangleTrace({ x: 1000, y: 600 }, { x: 200, y: 500 }, true, 480)).toEqual({ x: 200, y: 150, largeur: 800, hauteur: 450 });
  });
  it('ramène le zoom dans l’image', () => {
    expect(rectangleTrace({ x: 1800, y: 1000 }, { x: 1900, y: 1050 }, true, 480)).toEqual({ x: 1440, y: 810, largeur: 480, hauteur: 270 });
  });
});

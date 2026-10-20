import { describe, expect, it } from 'vitest';
import { progressionElement, tailleAccroche, transformationCamera, transformationZoom, volumeRaccord, volumeTapis, type Transformation } from './calculs';

describe('volumeRaccord', () => {
  it('atténue la première et la dernière image avec un fondu d\'une image', () => {
    expect(volumeRaccord(0, 30, 1)).toBe(0.5);
    expect(volumeRaccord(15, 30, 1)).toBe(1);
    expect(volumeRaccord(29, 30, 1)).toBe(0.5);
  });
  it('fait une rampe sur plusieurs images', () => {
    expect(volumeRaccord(0, 30, 2)).toBe(0.25);
    expect(volumeRaccord(1, 30, 2)).toBe(0.75);
    expect(volumeRaccord(2, 30, 2)).toBe(1);
  });
  it('traite un fondu nul comme une image', () => {
    expect(volumeRaccord(0, 30, 0)).toBe(0.5);
  });
});

describe('volumeTapis', () => {
  it('monte en 1,5 s, tient le volume réglé, descend sur les 2 dernières secondes', () => {
    expect(volumeTapis(0, 300, 30, 0.1)).toBe(0);
    expect(volumeTapis(45, 300, 30, 0.1)).toBeCloseTo(0.1);
    expect(volumeTapis(150, 300, 30, 0.1)).toBeCloseTo(0.1);
    expect(volumeTapis(270, 300, 30, 0.1)).toBeCloseTo(0.05);
    expect(volumeTapis(300, 300, 30, 0.1)).toBe(0);
  });
});

const proche = (t: Transformation, attendu: Transformation) => {
  expect(t.echelle).toBeCloseTo(attendu.echelle);
  expect(t.x).toBeCloseTo(attendu.x);
  expect(t.y).toBeCloseTo(attendu.y);
};

describe('progressionElement', () => {
  it('monte puis descend sur la durée de transition, adoucie', () => {
    expect(progressionElement(0, 100, 15)).toBe(0);
    expect(progressionElement(7.5, 100, 15)).toBeCloseTo(0.5);
    expect(progressionElement(3, 100, 15)).toBeLessThan(0.2);
    expect(progressionElement(50, 100, 15)).toBe(1);
    expect(progressionElement(100, 100, 15)).toBe(0);
  });
  it('raccourcit la transition d’un élément bref', () => {
    expect(progressionElement(5, 10, 15)).toBe(1);
  });
});

describe('transformationZoom', () => {
  const zone = { x: 960, y: 540, largeur: 960, hauteur: 540 };
  it('va de l’image entière à la zone en plein cadre', () => {
    proche(transformationZoom(zone, 0), { echelle: 1, x: 0, y: 0 });
    proche(transformationZoom(zone, 1), { echelle: 2, x: -1920, y: -1080 });
    proche(transformationZoom(zone, 0.5), { echelle: 4 / 3, x: -640, y: -360 });
  });
});

describe('transformationCamera', () => {
  const vignette = { x: 24, y: 786, largeur: 480, hauteur: 270 };
  it('agrandit la vignette deux fois et la centre', () => {
    proche(transformationCamera(vignette, 0), { echelle: 1, x: 0, y: 0 });
    // Coin haut gauche de la vignette : 24 × 2 + 432 = 480 ; 786 × 2 − 1302 = 270 (960×540 centré).
    proche(transformationCamera(vignette, 1), { echelle: 2, x: 432, y: -1302 });
  });
});

describe('tailleAccroche', () => {
  it('écrit grand une accroche courte', () => {
    expect(tailleAccroche('Copiez tout')).toBe(120);
  });
  it('réduit une accroche longue', () => {
    expect(tailleAccroche('Retrouvez tout ce que vous copiez')).toBe(84);
  });
  it('réduit assez pour qu’un mot très long tienne sur une ligne', () => {
    expect(tailleAccroche('Anticonstitutionnellement')).toBeLessThan(40);
  });
});

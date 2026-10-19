import { describe, expect, it } from 'vitest';
import { volumeRaccord, volumeTapis } from './calculs';

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

import { describe, expect, it } from 'vitest';
import type { EncartImages } from '../noyau/decisions';
import { DECALAGE_LOGO, decalageLogo, volumeRaccord } from './calculs';

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
});

describe('decalageLogo', () => {
  const encart = (p: Partial<EncartImages>): EncartImages => ({
    terme: 'API', definition: 'x', position: 'haut', debut: 100, duree: 60, ...p,
  });
  it('descend le logo pendant un encart en haut, avec transitions', () => {
    const e = [encart({})];
    expect(decalageLogo(85, e)).toBe(0);
    expect(decalageLogo(95, e)).toBe(DECALAGE_LOGO / 2);
    expect(decalageLogo(120, e)).toBe(DECALAGE_LOGO);
    expect(decalageLogo(165, e)).toBe(DECALAGE_LOGO / 2);
    expect(decalageLogo(175, e)).toBe(0);
  });
  it('ne bouge pas pour un encart en bas', () => {
    expect(decalageLogo(120, [encart({ position: 'bas' })])).toBe(0);
  });
});

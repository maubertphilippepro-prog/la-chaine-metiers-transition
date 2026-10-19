import { describe, expect, it } from 'vitest';
import { duree, horodatage } from './format';

describe('format', () => {
  it('horodate en minutes et secondes', () => {
    expect(horodatage(3.9)).toBe('0:03');
    expect(horodatage(65.4)).toBe('1:05');
    expect(horodatage(3725)).toBe('62:05');
  });
  it('écrit une durée au dixième avec une virgule', () => {
    expect(duree(0.84)).toBe('0,8 s');
    expect(duree(12)).toBe('12,0 s');
  });
});

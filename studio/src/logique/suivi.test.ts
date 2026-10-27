import { describe, expect, it } from 'vitest';
import { creerSuivi } from './suivi';

describe('creerSuivi', () => {
  it('prévient les abonnés quand la valeur change, pas quand elle reste la même', () => {
    const suivi = creerSuivi<number | null>(null);
    const vus: (number | null)[] = [];
    const desabonner = suivi.abonner(() => vus.push(suivi.lire()));
    suivi.changer(3);
    suivi.changer(3);
    suivi.changer(4);
    desabonner();
    suivi.changer(5);
    expect(vus).toEqual([3, 4]);
    expect(suivi.lire()).toBe(5);
  });
});

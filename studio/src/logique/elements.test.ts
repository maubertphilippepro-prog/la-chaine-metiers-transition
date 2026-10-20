import { describe, expect, it } from 'vitest';
import exemple from '../../../fixtures/analyse-exemple.json';
import type { Analyse, Montage } from '../../../noyau/types';
import { elementsAffiches, textePrerempli } from './elements';

const analyse = exemple as Analyse;

describe('elementsAffiches', () => {
  it('garde les éléments non écartés, par ordre d’apparition', () => {
    const m: Montage = {
      version: 1, titre: 'T', coupes: [], chapitres: [{ titre: 'Intro', debut: 0 }], termes: [],
      elements: [
        { id: 'e1', debut: 10, fin: 12, statut: 'valide', nature: 'camera' },
        { id: 'se0', debut: 2, fin: 4, statut: 'a-valider', nature: 'zoom', zone: null },
        { id: 'se1', debut: 1, fin: 3, statut: 'ecarte', nature: 'camera' },
      ],
    };
    expect(elementsAffiches(m).map(e => e.id)).toEqual(['se0', 'e1']);
    expect(m.elements.map(e => e.id)).toEqual(['e1', 'se0', 'se1']);
  });
});

describe('textePrerempli', () => {
  it('reprend les mots sélectionnés, coupés à la longueur maximale', () => {
    expect(textePrerempli(analyse, { premierMot: 0, dernierMot: 2 }, 40)).toBe('Bonjour à tous.');
    expect(textePrerempli(analyse, { premierMot: 0, dernierMot: 2 }, 9)).toBe('Bonjour à');
    expect(textePrerempli(analyse, { premierMot: 0, dernierMot: 2 }, 8)).toBe('Bonjour');
  });
});

import { describe, expect, it } from 'vitest';
import { classementsManquants, classificationsSite, type TypeClassement } from './classements';

const TYPES: TypeClassement[] = [
  { cle: 'outil', libelle: 'Par outil', multiple: false, obligatoire: true, valeurs: [{ id: 1, nom: 'Delos' }, { id: 2, nom: 'Excel' }] },
  { cle: 'theme', libelle: 'Par thème', multiple: true, obligatoire: false, valeurs: [{ id: 5, nom: 'vibe-coding' }, { id: 6, nom: 'en vrac' }] },
];

describe('classementsManquants', () => {
  it('accepte une valeur par type, ou Aucune sélection sur un type facultatif', () => {
    expect(classementsManquants(TYPES, { outil: [1], theme: [5, 6] })).toEqual([]);
    expect(classementsManquants(TYPES, { outil: [1], theme: 'aucun' })).toEqual([]);
  });
  it('signale un type non décidé ou vide', () => {
    expect(classementsManquants(TYPES, { outil: [1] })).toEqual(['Par thème : choisissez une valeur ou cochez Aucune sélection.']);
    expect(classementsManquants(TYPES, { outil: [], theme: [] })).toEqual([
      'Par outil : choisissez une valeur.',
      'Par thème : choisissez une valeur ou cochez Aucune sélection.',
    ]);
  });
  it('refuse Aucune sélection sur un type obligatoire, plusieurs valeurs sur un type simple, une valeur inconnue', () => {
    expect(classementsManquants(TYPES, { outil: 'aucun', theme: 'aucun' })).toEqual(['Par outil : choisissez une valeur.']);
    expect(classementsManquants(TYPES, { outil: [1, 2], theme: 'aucun' })).toEqual(['Par outil : une seule valeur possible.']);
    expect(classementsManquants(TYPES, { outil: [99], theme: 'aucun' })).toEqual(['Par outil : valeur inconnue du site, choisissez-en une autre.']);
  });
});

describe('classificationsSite', () => {
  it('envoie les valeurs de chaque type du site, Aucune sélection en liste vide', () => {
    expect(classificationsSite(TYPES, { outil: [1], theme: 'aucun', ancien: [3] })).toEqual({ outil: [1], theme: [] });
  });
});

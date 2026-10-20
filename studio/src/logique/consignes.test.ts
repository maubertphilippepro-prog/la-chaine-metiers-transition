import { describe, expect, it } from 'vitest';
import exemple from '../../../fixtures/analyse-exemple.json';
import type { Consigne, EtatProposition } from '../../../noyau/consignes';
import type { Analyse, Montage } from '../../../noyau/types';
import { bilan, demandeUneZone, passageDeProposition } from './consignes';

const analyse = exemple as Analyse;
const montage: Montage = {
  version: 1,
  titre: 'Essai',
  coupes: [{ id: 'l0', type: 'longueur', debut: 10, fin: 20, active: false, enAttente: true }],
  chapitres: [{ titre: 'Intro', debut: 0 }],
  termes: [],
  elements: [{ id: 'e0', debut: 3.0, fin: 4.3, statut: 'valide', nature: 'camera' }],
};

const consigne = (etats: EtatProposition[]): Consigne => ({
  id: 'c1',
  date: '2026-10-19T10:00:00.000Z',
  texte: 'T',
  ancrage: null,
  reformulation: 'R',
  nonRealisable: [],
  propositions: etats.map(etat => ({ operation: { type: 'titreVideo', titre: 'X' }, explication: 'e', etat })),
});

describe('passageDeProposition', () => {
  it('donne le passage d’une coupe à faire ou d’une coupe existante', () => {
    expect(passageDeProposition(analyse, montage, { type: 'couper', premierMot: 1, dernierMot: 2 })).toEqual({ debut: 1.25, fin: 1.8 });
    expect(passageDeProposition(analyse, montage, { type: 'deciderLongueur', idCoupe: 'l0', accepter: true })).toEqual({ debut: 10, fin: 20 });
    expect(passageDeProposition(analyse, montage, { type: 'basculerCoupe', idCoupe: 'x' })).toBeNull();
    expect(passageDeProposition(analyse, montage, { type: 'couper', premierMot: 1, dernierMot: 99 })).toBeNull();
  });
  it('ne donne pas de passage pour les autres opérations', () => {
    expect(passageDeProposition(analyse, montage, { type: 'titreVideo', titre: 'X' })).toBeNull();
  });
});

describe('bilan', () => {
  it('compte les propositions par état, accordé', () => {
    expect(bilan(consigne(['acceptee', 'acceptee', 'refusee']))).toBe('2 acceptées, 1 refusée');
    expect(bilan(consigne(['en-attente', 'invalide', 'invalide']))).toBe('1 en attente, 2 invalides');
    expect(bilan(consigne([]))).toBe('aucune opération');
  });
});

describe('propositions sur les éléments à l’écran', () => {
  it('donne le passage à écouter', () => {
    expect(passageDeProposition(analyse, montage, { type: 'ajouterElement', nature: 'texte', premierMot: 3, dernierMot: 5, texte: 'A' }))
      .toEqual({ debut: 3.0, fin: 4.3 });
    expect(passageDeProposition(analyse, montage, { type: 'modifierElement', idElement: 'e0', statut: 'ecarte' }))
      .toEqual({ debut: 3.0, fin: 4.3 });
    expect(passageDeProposition(analyse, montage, { type: 'modifierElement', idElement: 'e0', premierMot: 0, dernierMot: 2 }))
      .toEqual({ debut: 0.8, fin: 1.8 });
    expect(passageDeProposition(analyse, montage, { type: 'supprimerElement', idElement: 'x' })).toBeNull();
  });
  it('repère les propositions qui demandent une zone', () => {
    expect(demandeUneZone({ type: 'ajouterElement', nature: 'zoom', premierMot: 3, dernierMot: 5 })).toBe(true);
    expect(demandeUneZone({ type: 'ajouterElement', nature: 'texte', premierMot: 3, dernierMot: 5, texte: 'A' })).toBe(false);
    expect(demandeUneZone({ type: 'couper', premierMot: 0, dernierMot: 2 })).toBe(false);
  });
});

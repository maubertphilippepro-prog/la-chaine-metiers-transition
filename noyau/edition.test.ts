import { describe, expect, it } from 'vitest';
import {
  ajouterChapitre, ajouterTerme, basculerCoupe, changerTitre, couperPassage, deciderLongueur, deplacerLimite,
  fusionnerChapitre, modifierTerme, renommerChapitre,
} from './edition';
import type { Montage } from './types';

const base: Montage = {
  version: 1,
  titre: 'Essai',
  coupes: [
    { id: 'd0', type: 'silence', debut: 0, fin: 0.8, active: true },
    { id: 'l0', type: 'longueur', debut: 10, fin: 20, active: false, enAttente: true },
  ],
  chapitres: [{ titre: 'Intro', debut: 0 }, { titre: 'Suite', debut: 5 }, { titre: 'Fin', debut: 12 }],
  termes: [{ terme: 'SSO', definition: 'Déf.', occurrences: [3.8], statut: 'a-valider', position: 'bas' }],
};

describe('coupes', () => {
  it('rétablit puis recoupe un passage détecté sans modifier l’original', () => {
    const r = basculerCoupe(base, 'd0');
    expect(r.coupes[0]!.active).toBe(false);
    expect(basculerCoupe(r, 'd0').coupes[0]!.active).toBe(true);
    expect(base.coupes[0]!.active).toBe(true);
  });
  it('ne bascule pas une longueur en attente ni une coupe inconnue', () => {
    expect(basculerCoupe(base, 'l0')).toBe(base);
    expect(basculerCoupe(base, 'x')).toBe(base);
  });
  it('ajoute des coupes manuelles numérotées et supprime celle qu’on rétablit', () => {
    const a = couperPassage(couperPassage(base, 1, 2), 3, 4);
    expect(a.coupes.slice(2)).toEqual([
      { id: 'm0', type: 'manuelle', debut: 1, fin: 2, active: true },
      { id: 'm1', type: 'manuelle', debut: 3, fin: 4, active: true },
    ]);
    expect(basculerCoupe(a, 'm0').coupes.map(c => c.id)).toEqual(['d0', 'l0', 'm1']);
  });
  it('ignore un passage vide', () => {
    expect(couperPassage(base, 2, 2)).toBe(base);
  });
  it('accepte ou refuse une longueur', () => {
    expect(deciderLongueur(base, 'l0', true).coupes[1]).toMatchObject({ active: true, enAttente: false });
    expect(deciderLongueur(base, 'l0', false).coupes[1]).toMatchObject({ active: false, enAttente: false });
    expect(deciderLongueur(base, 'd0', true)).toBe(base);
  });
});

describe('termes', () => {
  it('modifie statut, définition et position', () => {
    const r = modifierTerme(base, 'SSO', { statut: 'valide', definition: 'Nouvelle.', position: 'haut' });
    expect(r.termes[0]).toEqual({ terme: 'SSO', definition: 'Nouvelle.', occurrences: [3.8], statut: 'valide', position: 'haut' });
    expect(modifierTerme(base, 'API', { statut: 'valide' })).toBe(base);
  });
});

describe('chapitres', () => {
  it('renomme', () => {
    expect(renommerChapitre(base, 1, 'Milieu').chapitres[1]).toEqual({ titre: 'Milieu', debut: 5 });
    expect(renommerChapitre(base, 5, 'X')).toBe(base);
  });
  it('déplace une limite entre ses voisines seulement', () => {
    expect(deplacerLimite(base, 1, 7).chapitres[1]!.debut).toBe(7);
    expect(deplacerLimite(base, 1, 12)).toBe(base);
    expect(deplacerLimite(base, 1, 0)).toBe(base);
    expect(deplacerLimite(base, 0, 1)).toBe(base);
    expect(deplacerLimite(base, 2, 30).chapitres[2]!.debut).toBe(30);
  });
  it('fusionne avec le précédent', () => {
    expect(fusionnerChapitre(base, 1).chapitres).toEqual([{ titre: 'Intro', debut: 0 }, { titre: 'Fin', debut: 12 }]);
    expect(fusionnerChapitre(base, 0)).toBe(base);
    expect(fusionnerChapitre(base, 3)).toBe(base);
  });
  it('ajoute un chapitre à sa place', () => {
    expect(ajouterChapitre(base, 8, 'Nouveau').chapitres.map(c => c.debut)).toEqual([0, 5, 8, 12]);
    expect(ajouterChapitre(base, 5, 'Doublon')).toBe(base);
    expect(ajouterChapitre(base, 0, 'Début')).toBe(base);
  });
});

describe('ajouts des consignes', () => {
  it('ajoute un terme à valider, encart en bas, occurrences triées sans doublon', () => {
    expect(ajouterTerme(base, 'prompt', 'Consigne donnée à une IA.', [5, 1.2, 5]).termes[1]).toEqual({
      terme: 'prompt', definition: 'Consigne donnée à une IA.', occurrences: [1.2, 5], statut: 'a-valider', position: 'bas',
    });
  });
  it('ignore un terme déjà présent, sans tenir compte de la casse', () => {
    expect(ajouterTerme(base, 'sso', 'Autre.', [1])).toBe(base);
  });
  it('change le titre de la vidéo', () => {
    expect(changerTitre(base, 'Nouveau').titre).toBe('Nouveau');
    expect(changerTitre(base, 'Essai')).toBe(base);
  });
});

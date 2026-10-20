import { describe, expect, it } from 'vitest';
import exemple from '../fixtures/analyse-exemple.json';
import reglagesJson from '../reglages.json';
import { problemeDe, problemesElements } from './elements';
import type { Analyse, ElementEcran, Montage, PositionTexte, Reglages, Terme, Zone } from './types';

const analyse = exemple as Analyse;
const r: Reglages = reglagesJson;
const ZONE: Zone = { x: 480, y: 270, largeur: 960, hauteur: 540 };
// Coupe 1,86–2,94 : segments [0, 1.86] et [2.94, 30].
const montage = (elements: ElementEcran[], termes: Terme[] = []): Montage => ({
  version: 1,
  titre: 'Essai',
  coupes: [{ id: 'd1', type: 'hesitation', debut: 1.8, fin: 3.0, active: true }],
  chapitres: [{ titre: 'Intro', debut: 0 }, { titre: 'Le SSO', debut: 3.0 }],
  termes,
  elements,
});
const texte = (id: string, debut: number, fin: number, position: PositionTexte = 'haut-gauche', contenu = 'Windows + V'): ElementEcran => ({
  id, debut, fin, statut: 'valide', nature: 'texte', texte: contenu, position,
});
const zoom = (id: string, debut: number, fin: number, zone: Zone | null = ZONE): ElementEcran => ({
  id, debut, fin, statut: 'valide', nature: 'zoom', zone,
});
const miseEnAvant = (id: string, debut: number, fin: number, zone: Zone = ZONE): ElementEcran => ({
  id, debut, fin, statut: 'valide', nature: 'miseEnAvant', zone,
});
const camera = (id: string, debut: number, fin: number): ElementEcran => ({ id, debut, fin, statut: 'valide', nature: 'camera' });
const problemes = (m: Montage) => problemesElements(analyse, m, r).map(p => `${p.id} : ${p.probleme}`);

describe('problemesElements', () => {
  it('accepte des éléments qui respectent les règles', () => {
    expect(problemes(montage([
      zoom('e0', 3.0, 4.3), texte('e1', 3.0, 4.3), camera('e2', 10, 12), miseEnAvant('e3', 20, 22),
    ]))).toEqual([]);
  });
  it('compte la durée à l’écran une fois les coupes retirées', () => {
    expect(problemes(montage([
      texte('e0', 1.9, 2.9), texte('e1', 3.0, 3.5, 'centre'), texte('e2', 1.0, 3.4, 'bas-centre'), texte('e3', 5, 5, 'haut-droite'),
    ]))).toEqual([
      'e0 : Le passage est entièrement coupé.',
      'e1 : Moins de 1 s à l’écran une fois les coupes retirées.',
      'e2 : Moins de 1 s à l’écran une fois les coupes retirées.',
      'e3 : Le passage est vide.',
    ]);
  });
  it('applique la durée minimale à chaque épisode que l’élément traverse', () => {
    const m = (elements: ElementEcran[]): Montage => ({ ...montage(elements), coupes: [], chapitres: [{ titre: 'A', debut: 0 }, { titre: 'B', debut: 10 }] });
    expect(problemesElements(analyse, m([zoom('e0', 9.6, 11)]), r).map(p => p.id)).toEqual(['e0']);
    expect(problemesElements(analyse, m([zoom('e0', 8.5, 11.5)]), r)).toEqual([]);
  });
  it('contrôle le texte et la zone', () => {
    expect(problemes(montage([
      texte('e0', 3, 5, 'haut-gauche', ' '),
      texte('e1', 6, 8, 'haut-gauche', 'x'.repeat(41)),
      zoom('e2', 9, 11, { x: 0, y: 0, largeur: 960, hauteur: 600 }),
      zoom('e3', 12, 14, { x: 0, y: 0, largeur: 400, hauteur: 225 }),
      miseEnAvant('e4', 15, 17, { x: 1800, y: 0, largeur: 300, hauteur: 100 }),
      zoom('e5', 18, 20, { x: 1, y: 1, largeur: 960, hauteur: 541 }),
    ]))).toEqual([
      'e0 : Le texte est vide.',
      'e1 : Le texte dépasse 40 caractères.',
      'e2 : La zone d’un zoom doit être en 16:9.',
      'e3 : La zone d’un zoom doit faire au moins 480 pixels de large.',
      'e4 : La zone sort de l’image.',
    ]);
  });
  it('exige une zone pour un zoom validé, pas pour une suggestion à valider', () => {
    const suggestion: ElementEcran = { ...zoom('se0', 10, 12, null), statut: 'a-valider' };
    expect(problemes(montage([zoom('e0', 3, 5, null), suggestion]))).toEqual(['e0 : La zone est à tracer.']);
  });
  it('refuse deux cadres en même temps, pour chacun des deux', () => {
    expect(problemes(montage([zoom('e0', 10, 14), camera('e1', 12, 16)]))).toEqual([
      'e0 : Chevauche la caméra en grand e1 : un seul zoom ou caméra en grand à la fois.',
      'e1 : Chevauche le zoom e0 : un seul zoom ou caméra en grand à la fois.',
    ]);
    expect(problemes(montage([zoom('e0', 10, 12), zoom('e1', 12, 14)]))).toEqual([]);
  });
  it('refuse une mise en avant pendant un zoom ou la caméra en grand', () => {
    expect(problemes(montage([miseEnAvant('e0', 10, 14), zoom('e1', 12, 16)]))).toEqual([
      'e0 : Une mise en avant ne peut pas avoir lieu pendant le zoom e1.',
      'e1 : Chevauche la mise en avant e0, qui ne correspondrait plus à l’image.',
    ]);
  });
  it('refuse deux textes à la même position en même temps', () => {
    expect(problemes(montage([texte('e0', 10, 14), texte('e1', 12, 16), texte('e2', 12, 16, 'centre')]))).toEqual([
      'e0 : Chevauche le texte e1, à la même position.',
      'e1 : Chevauche le texte e0, à la même position.',
    ]);
  });
  it('compte les éléments à valider, ignore les écartés', () => {
    const aValider: ElementEcran = { ...camera('se0', 12, 16), statut: 'a-valider' };
    const ecarte: ElementEcran = { ...camera('se1', 12, 16), statut: 'ecarte' };
    expect(problemes(montage([zoom('e0', 10, 14), ecarte]))).toEqual([]);
    expect(problemes(montage([zoom('e0', 10, 14), aValider]))).toHaveLength(2);
  });
  it('refuse un texte en haut à droite pendant un encart de définition en haut', () => {
    // Encart de SSO : prononcé à 3,8 s, affiché 6 s → source 3,8 à 9,8.
    const sso: Terme = { terme: 'SSO', definition: 'Déf.', occurrences: [3.8], statut: 'valide', position: 'haut' };
    expect(problemes(montage([texte('e0', 3.0, 4.3, 'haut-droite')], [sso]))).toEqual([
      'e0 : Un texte en haut à droite ne peut pas paraître pendant l’encart « SSO ».',
    ]);
    expect(problemes(montage([texte('e0', 3.0, 4.3, 'haut-droite')], [{ ...sso, position: 'bas' }]))).toEqual([]);
    expect(problemes(montage([texte('e0', 12, 14, 'haut-droite')], [sso]))).toEqual([]);
  });
});

describe('problemeDe', () => {
  it('donne le premier problème de l’élément, ou null', () => {
    const m = montage([zoom('e0', 10, 14), camera('e1', 12, 16), texte('e2', 20, 22)]);
    expect(problemeDe(analyse, m, 'e1', r)).toBe('Chevauche le zoom e0 : un seul zoom ou caméra en grand à la fois.');
    expect(problemeDe(analyse, m, 'e2', r)).toBeNull();
    expect(problemeDe(analyse, m, 'x', r)).toBeNull();
  });
});

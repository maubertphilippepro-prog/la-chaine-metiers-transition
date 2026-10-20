import { describe, expect, it } from 'vitest';
import exemple from '../fixtures/analyse-exemple.json';
import reglagesJson from '../reglages.json';
import type { Consigne } from './consignes';
import type { Analyse, Montage, Reglages } from './types';
import { verifierAvantRendu } from './verifications';

const analyse = exemple as Analyse;
const reglages: Reglages = reglagesJson;

const pret: Montage = {
  version: 1,
  titre: 'Essai',
  coupes: [{ id: 'l0', type: 'longueur', debut: 1, fin: 2, active: true, enAttente: false }],
  chapitres: [{ titre: 'Intro', debut: 0 }],
  termes: [
    { terme: 'SSO', definition: 'Déf.', occurrences: [], statut: 'valide', position: 'bas' },
    { terme: 'API', definition: '', occurrences: [], statut: 'ecarte', position: 'bas' },
  ],
  elements: [],
};

describe('verifierAvantRendu', () => {
  it('accepte un montage prêt', () => {
    expect(verifierAvantRendu(analyse, pret, reglages)).toEqual([]);
  });
  it('liste chaque problème', () => {
    const terme = pret.termes[0]!;
    const m: Montage = {
      ...pret,
      titre: ' ',
      chapitres: [{ titre: 'Intro', debut: 0 }, { titre: '', debut: 5 }],
      coupes: [...pret.coupes, { id: 'l1', type: 'longueur', debut: 3, fin: 4, active: false, enAttente: true }],
      termes: [
        { ...terme, definition: 'x'.repeat(161) },
        { ...terme, terme: 'IA', definition: ' ' },
        { ...terme, terme: 'Web', statut: 'a-valider' },
      ],
    };
    expect(verifierAvantRendu(analyse, m, reglages)).toEqual([
      'La vidéo complète n’a pas de titre.',
      'Le chapitre 2 n’a pas de titre.',
      'La définition de « SSO » dépasse 160 caractères.',
      'La définition de « IA » est vide.',
      'Le terme « Web » n’est ni validé ni écarté.',
      '1 suggestion(s) de longueur en attente.',
    ]);
  });
  it('bloque sur une proposition de consigne en attente, pas sur une invalide', () => {
    const consigne: Consigne = {
      id: 'c1',
      date: '2026-10-19T10:00:00.000Z',
      texte: 'Renomme',
      ancrage: null,
      reformulation: 'Renommer.',
      nonRealisable: [],
      propositions: [
        { operation: { type: 'titreVideo', titre: 'A' }, explication: 'a', etat: 'en-attente' },
        { operation: { type: 'titreVideo', titre: 'B' }, explication: 'b', etat: 'invalide', probleme: 'p' },
        { operation: { type: 'titreVideo', titre: 'C' }, explication: 'c', etat: 'acceptee' },
      ],
    };
    expect(verifierAvantRendu(analyse, pret, reglages, [consigne])).toEqual(['Consigne : 1 proposition(s) en attente.']);
    expect(verifierAvantRendu(analyse, pret, reglages, [{ ...consigne, propositions: consigne.propositions.slice(1) }])).toEqual([]);
  });
  it('bloque sur les éléments à l’écran à valider ou en défaut', () => {
    // pret coupe 1 à 2 s : un texte de 3,0 à 3,5 ne reste que 0,5 s.
    const m: Montage = {
      ...pret,
      elements: [
        { id: 'se0', debut: 3.0, fin: 4.3, statut: 'a-valider', nature: 'zoom', zone: null },
        { id: 'e0', debut: 3.0, fin: 3.5, statut: 'valide', nature: 'texte', texte: 'Windows + V', position: 'centre' },
        { id: 'e1', debut: 10, fin: 12, statut: 'ecarte', nature: 'camera' },
      ],
    };
    expect(verifierAvantRendu(analyse, m, reglages)).toEqual([
      '1 élément(s) à l’écran à valider.',
      'Élément se0 : La zone est à tracer.',
      'Élément e0 : Moins de 1 s à l’écran une fois les coupes retirées.',
    ]);
  });
});

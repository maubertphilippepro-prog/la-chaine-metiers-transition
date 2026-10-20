import { describe, expect, it } from 'vitest';
import type { Consigne } from './consignes';
import type { Montage } from './types';
import { verifierAvantRendu } from './verifications';

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
    expect(verifierAvantRendu(pret, 160)).toEqual([]);
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
    expect(verifierAvantRendu(m, 160)).toEqual([
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
    expect(verifierAvantRendu(pret, 160, [consigne])).toEqual(['Consigne : 1 proposition(s) en attente.']);
    expect(verifierAvantRendu(pret, 160, [{ ...consigne, propositions: consigne.propositions.slice(1) }])).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
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
});

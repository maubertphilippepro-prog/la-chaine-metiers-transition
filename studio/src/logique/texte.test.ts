import { describe, expect, it } from 'vitest';
import exemple from '../../../fixtures/analyse-exemple.json';
import type { Analyse, Montage } from '../../../noyau/types';
import { construireTexte, type ElementTexte } from './texte';

const analyse = exemple as Analyse;
const resume = (e: ElementTexte) =>
  e.genre === 'trou'
    ? `<${e.coupe.id}>`
    : `${e.mot.texte}${e.coupe ? `[${e.coupe.id}]` : ''}${e.terme ? `{${e.terme}}` : ''}`;

describe('construireTexte', () => {
  it('range mots et trous par chapitre, avec coupes et termes', () => {
    const montage: Montage = {
      version: 1,
      titre: 'T',
      coupes: [
        { id: 'd0', type: 'silence', debut: 0, fin: 0.8, active: true },
        { id: 'd1', type: 'hesitation', debut: 1.8, fin: 3.0, active: false },
        { id: 'm0', type: 'manuelle', debut: 1.2, fin: 1.85, active: true },
        { id: 'l0', type: 'longueur', debut: 3.0, fin: 3.8, active: false, enAttente: true },
      ],
      chapitres: [{ titre: 'Le SSO', debut: 3 }, { titre: 'Intro', debut: 0 }],
      termes: [{ terme: 'SSO', definition: 'D', occurrences: [3.8], statut: 'valide', position: 'bas' }],
      elements: [],
    };
    expect(construireTexte(analyse, montage).map(b => [b.index, b.titre, b.debut, b.elements.map(resume)])).toEqual([
      [1, 'Intro', 0, ['<d0>', 'Bonjour', 'à[m0]', 'tous.[m0]', '<d1>']],
      [0, 'Le SSO', 3, ["Aujourd'hui,[l0]", 'le[l0]', 'SSO.{SSO}']],
    ]);
  });
  it('affiche la coupe active avant une coupe rétablie et ne surligne pas un terme écarté', () => {
    const montage: Montage = {
      version: 1,
      titre: 'T',
      coupes: [
        { id: 'r', type: 'repetition', debut: 0.8, fin: 1.2, active: false },
        { id: 'a', type: 'manuelle', debut: 0.8, fin: 1.2, active: true },
      ],
      chapitres: [{ titre: 'Seul', debut: 0 }],
      termes: [{ terme: 'SSO', definition: 'D', occurrences: [3.8], statut: 'ecarte', position: 'bas' }],
      elements: [],
    };
    const [bloc] = construireTexte(analyse, montage);
    expect(bloc!.elements.map(resume)).toEqual(['Bonjour[a]', 'à', 'tous.', "Aujourd'hui,", 'le', 'SSO.']);
  });
  it('repère les passages couverts par un élément non écarté', () => {
    const montage: Montage = {
      version: 1, titre: 'T', coupes: [], chapitres: [{ titre: 'Intro', debut: 0 }], termes: [],
      elements: [
        { id: 'e0', debut: 3.0, fin: 4.3, statut: 'valide', nature: 'texte', texte: 'SSO', position: 'centre' },
        { id: 'e1', debut: 3.6, fin: 3.8, statut: 'a-valider', nature: 'zoom', zone: null },
        { id: 'e2', debut: 0.8, fin: 1.8, statut: 'ecarte', nature: 'camera' },
      ],
    };
    const mots = construireTexte(analyse, montage)[0]!.elements.flatMap(e => (e.genre === 'mot' ? [[e.mot.texte, e.reperes]] : []));
    expect(mots).toEqual([
      ['Bonjour', []], ['à', []], ['tous.', []], ["Aujourd'hui,", ['texte']], ['le', ['texte', 'zoom']], ['SSO.', ['texte']],
    ]);
  });
});

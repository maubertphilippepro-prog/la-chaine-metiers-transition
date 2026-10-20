import { describe, expect, it } from 'vitest';
import exemple from '../fixtures/analyse-exemple.json';
import { integrerSuggestions, montageInitial } from './montage-initial';
import type { Analyse } from './types';

const analyse = exemple as Analyse;

describe('montageInitial', () => {
  const m = montageInitial(analyse, 'Épisode test');

  it('active les détections et ajoute les longueurs inactives', () => {
    expect(m.coupes).toEqual([
      { id: 'd0', type: 'silence', debut: 0, fin: 0.8, active: true },
      { id: 'd1', type: 'hesitation', debut: 1.8, fin: 3, active: true },
      { id: 'l0', type: 'longueur', debut: 10, fin: 20, active: false, enAttente: true },
    ]);
  });
  it('désactive une hésitation où la réécoute a entendu des mots', () => {
    const avecParoles: Analyse = {
      ...analyse,
      detections: analyse.detections.map(d => (d.id === 'd1' ? { ...d, paroles: 'il y a' } : d)),
    };
    expect(montageInitial(avecParoles, 'x').coupes.map(c => [c.id, c.active])).toEqual([
      ['d0', true], ['d1', false], ['l0', false],
    ]);
  });
  it('force le premier chapitre à 0', () => {
    expect(m.chapitres).toEqual([
      { titre: 'Introduction', debut: 0 },
      { titre: 'Le SSO', debut: 3 },
    ]);
  });
  it('valide d\'office les termes du glossaire', () => {
    expect(m.termes.map(t => [t.terme, t.statut, t.position])).toEqual([
      ['SSO', 'a-valider', 'bas'],
      ['API', 'valide', 'bas'],
    ]);
  });
  it('crée un chapitre unique sans suggestions', () => {
    const sans = montageInitial({ ...analyse, suggestions: null }, 'Titre');
    expect(sans.chapitres).toEqual([{ titre: 'Titre', debut: 0 }]);
    expect(sans.termes).toEqual([]);
    expect(sans.coupes).toHaveLength(2);
  });
});

describe('montageInitial et analyse', () => {
  it('copie les occurrences des termes', () => {
    const a = structuredClone(analyse);
    const avant = structuredClone(a.suggestions!.termes[0]!.occurrences);
    montageInitial(a, 'T').termes[0]!.occurrences.push(999);
    expect(a.suggestions!.termes[0]!.occurrences).toEqual(avant);
  });
});

describe('integrerSuggestions', () => {
  it('ajoute longueurs, termes et chapitres à un montage fait sans suggestions', () => {
    const sans = montageInitial({ ...analyse, suggestions: null }, 'Titre');
    const decide = { ...sans, coupes: sans.coupes.map(c => ({ ...c, active: false })) };
    const r = integrerSuggestions(decide, analyse);
    expect(r.coupes.map(c => [c.id, c.active])).toEqual([['d0', false], ['d1', false], ['l0', false]]);
    expect(r.coupes[2]!.enAttente).toBe(true);
    expect(r.chapitres).toEqual([{ titre: 'Introduction', debut: 0 }, { titre: 'Le SSO', debut: 3 }]);
    expect(r.termes.map(t => t.terme)).toEqual(['SSO', 'API']);
  });
  it('garde les décisions déjà prises', () => {
    const m = montageInitial(analyse, 'T');
    const modifie = {
      ...m,
      chapitres: [{ titre: 'A', debut: 0 }, { titre: 'B', debut: 2 }],
      termes: [{ ...m.termes[0]!, statut: 'ecarte' as const }],
    };
    const r = integrerSuggestions(modifie, analyse);
    expect(r.chapitres).toEqual(modifie.chapitres);
    expect(r.coupes).toHaveLength(3);
    expect(r.termes.map(t => [t.terme, t.statut])).toEqual([['SSO', 'ecarte'], ['API', 'valide']]);
  });
});

describe('éléments suggérés', () => {
  const avecElements: Analyse = {
    ...analyse,
    suggestions: {
      ...analyse.suggestions!,
      elements: [
        { id: 'se0', nature: 'texte', debut: 3.0, fin: 4.3, texte: 'SSO', raison: 'Sigle prononcé.' },
        { id: 'se1', nature: 'zoom', debut: 0.8, fin: 1.8, raison: 'Désigne l’écran.' },
      ],
    },
  };

  it('transforme chaque suggestion en élément à valider', () => {
    expect(montageInitial(avecElements, 'T').elements).toEqual([
      { id: 'se0', debut: 3.0, fin: 4.3, statut: 'a-valider', nature: 'texte', texte: 'SSO', position: 'haut-gauche' },
      { id: 'se1', debut: 0.8, fin: 1.8, statut: 'a-valider', nature: 'zoom', zone: null },
    ]);
  });
  it('lit une analyse sans suggestions d’éléments comme une liste vide', () => {
    expect(montageInitial(analyse, 'T').elements).toEqual([]);
    expect(montageInitial({ ...analyse, suggestions: null }, 'T').elements).toEqual([]);
  });
  it('ajoute les suggestions d’éléments absentes sans toucher aux autres', () => {
    const m = {
      ...montageInitial(analyse, 'T'),
      elements: [{ id: 'se0', debut: 3.0, fin: 4.3, statut: 'ecarte' as const, nature: 'camera' as const }],
    };
    expect(integrerSuggestions(m, avecElements).elements.map(e => [e.id, e.statut])).toEqual([
      ['se0', 'ecarte'], ['se1', 'a-valider'],
    ]);
  });
});

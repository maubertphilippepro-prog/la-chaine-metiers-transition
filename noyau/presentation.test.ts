import { describe, expect, it } from 'vitest';
import { lignePresentation, lirePresentation, motsTitre, textePresentation } from './presentation';

describe('présentation SharePoint', () => {
  const p = { titre: 'Produire un livrable technique fiable en moins d’1h ?', tags: ['Mindra (powered by There.do)'], description: 'Cette vidéo…' };
  it('ajoute la durée arrondie et le nombre de vidéos aux tags', () => {
    expect(lignePresentation(p, 590)).toBe('Mindra (powered by There.do) • 10 minutes • 1 vidéo');
    expect(lignePresentation({ ...p, tags: [] }, 20)).toBe('1 minute • 1 vidéo');
  });
  it('assemble le texte à coller', () => {
    expect(textePresentation(p, 600)).toBe('Produire un livrable technique fiable en moins d’1h ?\nMindra (powered by There.do) • 10 minutes • 1 vidéo\n\nCette vidéo…\n');
  });
  it('compte les mots du titre et relit un JSON incomplet', () => {
    expect(motsTitre(p.titre)).toBe(9);
    expect(lirePresentation({ titre: 'T', tags: ['a', 3] })).toEqual({ titre: 'T', tags: ['a'], description: '' });
  });
});

import { describe, expect, it } from 'vitest';
import { accorderPublication, modifierVideo } from '../../../noyau/publication';
import { changerProfilParDefaut, libelleCible, tagsDepuisTexte, texteDepuisTags } from './publication';

describe('tags', () => {
  it('découpe sur les virgules et retire les vides', () => {
    expect(tagsDepuisTexte(' Windows, presse-papiers ,, ia ')).toEqual(['Windows', 'presse-papiers', 'ia']);
    expect(texteDepuisTags(['a', 'b c'])).toBe('a, b c');
  });
});

describe('libelleCible', () => {
  it('nomme la vidéo complète et les épisodes', () => {
    expect(libelleCible('complete')).toBe('Vidéo complète');
    expect(libelleCible(2)).toBe('Épisode 2');
  });
});

describe('changerProfilParDefaut', () => {
  it('change le profil des vidéos qui suivaient l’ancien défaut', () => {
    const p = modifierVideo(accorderPublication(null, ['complete', 1]), 1, { profil: 'interne' });
    const q = changerProfilParDefaut(p, 'mixte');
    expect(q.profilParDefaut).toBe('mixte');
    expect(q.videos.map(v => v.profil)).toEqual(['mixte', 'interne']);
  });
});

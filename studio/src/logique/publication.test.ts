import { describe, expect, it } from 'vitest';
import { accorderPublication, modifierVideo } from '../../../noyau/publication';
import { baseVignette, changerProfilParDefaut, libelleCible, tagsDepuisTexte, texteDepuisTags } from './publication';

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

describe('baseVignette', () => {
  const complete = { pose: { source: 'camera' as const, instant: 4 }, fond: { source: 'ecran' as const, instant: 9 }, accroche: 'Titre', fichier: 'x.jpg' };
  const propre = { pose: { source: 'banque' as const, fichier: 'a.jpg' }, fond: { source: 'charte' as const }, accroche: '', fichier: null };
  it('garde la vignette de l’épisode quand elle existe', () => {
    expect(baseVignette(propre, complete, 'b.jpg')).toEqual({ pose: propre.pose, fond: propre.fond });
  });
  it('reprend pose et fond de la vidéo complète, pas l’accroche', () => {
    expect(baseVignette(null, complete, 'b.jpg')).toEqual({ pose: complete.pose, fond: complete.fond });
  });
  it('retombe sur la première pose de la banque et la charte', () => {
    expect(baseVignette(null, null, 'b.jpg')).toEqual({ pose: { source: 'banque', fichier: 'b.jpg' }, fond: { source: 'charte' } });
    expect(baseVignette(null, null, undefined)).toEqual({ pose: null, fond: { source: 'charte' } });
  });
});

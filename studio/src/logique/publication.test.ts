import { describe, expect, it } from 'vitest';
import { accorderPublication, modifierVideo, videoParDefaut } from '../../../noyau/publication';
import { diffusion, type Qualification } from '../../../noyau/qualification';
import {
  appliquerProposition, basculer, basePose, changerQualificationParDefaut, EXPLICATIONS_RELAIS, isoDepuisLocal, libelleCible, LIBELLES_VISIBILITE, localDepuisIso,
  requalificationRetire, resumeDiffusion, tagsDepuisTexte, texteDepuisTags, vignetteDepuisProposition,
} from './publication';

const PERSO: Qualification = { nature: 'perso', confidentielle: false };
const PRO: Qualification = { nature: 'pro', confidentielle: false };
const PRO_CONF: Qualification = { nature: 'pro', confidentielle: true };

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

describe('changerQualificationParDefaut', () => {
  it('requalifie les vidéos qui suivaient l’ancien défaut, sauf celles déjà sur le site', () => {
    let p = accorderPublication(null, ['complete', 1, 2]);
    p = modifierVideo(p, 1, PRO_CONF);
    p = modifierVideo(p, 2, { replit: { id: 42, categorieId: 1, playlistId: null } });
    const q = changerQualificationParDefaut(p, PRO);
    expect(q.qualificationParDefaut).toEqual(PRO);
    expect(q.videos.map(v => [v.nature, v.confidentielle])).toEqual([['pro', false], ['pro', true], ['perso', false]]);
  });
});

describe('requalificationRetire', () => {
  const surLeSite = { ...modifierVideo(accorderPublication(null, ['complete']), 'complete', PRO_CONF).videos[0]!, replit: { id: 42, categorieId: 1, playlistId: null } };
  it('demande le retrait d’une vidéo du site passée en Perso', () => {
    expect(requalificationRetire(surLeSite, PERSO)).toBe(true);
    expect(requalificationRetire(surLeSite, PRO)).toBe(false);
    expect(requalificationRetire({ ...surLeSite, replit: { id: null, categorieId: null, playlistId: null } }, PERSO)).toBe(false);
  });
});

describe('resumeDiffusion', () => {
  it('résume la diffusion déduite en une ligne', () => {
    expect(resumeDiffusion(diffusion(PRO))).toBe('YouTube : Non répertoriée · Site : lien YouTube, visible de tous');
    expect(resumeDiffusion(diffusion(PRO_CONF))).toBe('YouTube : aucun envoi · Site : fichier vidéo, réservé aux comptes autorisés');
    expect(resumeDiffusion(diffusion({ nature: 'perso', confidentielle: true }))).toBe('YouTube : Privée · Site : rien');
    expect(resumeDiffusion(diffusion(PERSO))).toBe('YouTube : Publique ou Programmée · Site : rien');
  });
});

describe('basePose', () => {
  const complete = { pose: { source: 'banque' as const, fichier: 'c.jpg' }, accroche: 'Titre', gabarit: 'classique' as const, logos: [], captures: [], fichier: 'x.jpg' };
  const propre = { pose: { source: 'banque' as const, fichier: 'a.jpg' }, accroche: '', gabarit: 'classique' as const, logos: [], captures: [], fichier: null };
  it('garde la pose de l’épisode quand il a une vignette', () => {
    expect(basePose(propre, complete, 'b.jpg')).toEqual(propre.pose);
  });
  it('reprend la pose de la vidéo complète', () => {
    expect(basePose(null, complete, 'b.jpg')).toEqual(complete.pose);
  });
  it('retombe sur la première pose de la banque, sinon aucune', () => {
    expect(basePose(null, null, 'b.jpg')).toEqual({ source: 'banque', fichier: 'b.jpg' });
    expect(basePose(null, null, undefined)).toBeNull();
  });
});

describe('dates de programmation', () => {
  it('passe d’un champ date et heure locale à une date ISO et retour', () => {
    const iso = isoDepuisLocal('2026-10-21T18:30');
    expect(iso).toBe(new Date('2026-10-21T18:30').toISOString());
    expect(localDepuisIso(iso)).toBe('2026-10-21T18:30');
  });
  it('laisse vide ce qui n’est pas une date', () => {
    expect(isoDepuisLocal('')).toBeNull();
    expect(isoDepuisLocal('n’importe quoi')).toBeNull();
    expect(localDepuisIso(null)).toBe('');
  });
  it('nomme les visibilités comme YouTube Studio', () => {
    expect(LIBELLES_VISIBILITE).toEqual({ privee: 'Privée', 'non-repertoriee': 'Non répertoriée', publique: 'Publique', programmee: 'Programmée' });
  });
});

describe('relais sur le site', () => {
  it('explique les deux formes de relais', () => {
    expect(Object.keys(EXPLICATIONS_RELAIS)).toEqual(['fichier', 'lien']);
    expect(EXPLICATIONS_RELAIS.fichier).toContain('comptes autorisés');
    expect(EXPLICATIONS_RELAIS.lien).toContain('lisible par lien');
  });
});

describe('basculer', () => {
  it('accepte un autre maximum', () => {
    expect(basculer(['a', 'b', 'c', 'd'], 'e', 5)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(basculer(['a', 'b', 'c', 'd', 'e'], 'f', 5)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('coche dans l’ordre des clics, décoche, et s’arrête à trois', () => {
    expect(basculer([], 'a')).toEqual(['a']);
    expect(basculer(['a', 'b'], 'a')).toEqual(['b']);
    expect(basculer(['a', 'b', 'c'], 'd')).toEqual(['a', 'b', 'c']);
  });
});

describe('appliquerProposition', () => {
  const proposition = { pose: 'b.jpg', logos: ['excel.png'], captures: ['a.png'], gabarit: 'demonstration' as const, accroche: 'Planning facile', explication: 'En grand.' };
  const consigne = { texte: 'Le planning', compris: 'Planning.', pasRealisable: [], propositions: [proposition, { ...proposition, gabarit: 'classique' as const }], choisie: null };
  const video = {
    ...videoParDefaut('complete', PERSO),
    vignette: { pose: { source: 'banque' as const, fichier: 'a.jpg' }, accroche: 'Ancienne', gabarit: 'classique' as const, logos: [], captures: [], fichier: 'rendus/vignettes/complete.jpg' },
    consignesVignette: [consigne, { ...consigne, texte: 'Autre', choisie: 0 }],
  };
  it('compose la vignette d’après la proposition et la marque retenue', () => {
    const c = appliquerProposition(video, 0, 1);
    expect(c.vignette).toEqual({
      pose: { source: 'banque', fichier: 'b.jpg' }, accroche: 'Planning facile', gabarit: 'classique', logos: ['excel.png'], captures: ['a.png'],
      fichier: 'rendus/vignettes/complete.jpg',
    });
    expect(c.consignesVignette!.map(x => x.choisie)).toEqual([1, 0]);
  });
  it('ne change rien pour une proposition inconnue', () => {
    expect(appliquerProposition(video, 5, 0)).toEqual({});
    expect(appliquerProposition(video, 0, 7)).toEqual({});
  });
  it('compose une vignette sans fichier rendu pour l’aperçu', () => {
    expect(vignetteDepuisProposition(proposition, null)).toMatchObject({ pose: { source: 'banque', fichier: 'b.jpg' }, fichier: null });
  });
});

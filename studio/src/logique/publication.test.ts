import { describe, expect, it } from 'vitest';
import { accorderPublication, modifierVideo, videoParDefaut } from '../../../noyau/publication';
import { diffusion, type Qualification } from '../../../noyau/qualification';
import {
  basculer, baseVignette, changerQualificationParDefaut, EXPLICATIONS_RELAIS, gabaritsAutres, isoDepuisLocal, libelleCible, LIBELLES_VISIBILITE, localDepuisIso,
  requalificationRetire, resumeDiffusion, tagsDepuisTexte, texteDepuisTags,
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

describe('baseVignette', () => {
  const complete = { pose: { source: 'camera' as const, instant: 4 }, fond: { source: 'ecran' as const, instant: 9 }, accroche: 'Titre', gabarit: 'classique' as const, logos: [], captures: [], fichier: 'x.jpg' };
  const propre = { pose: { source: 'banque' as const, fichier: 'a.jpg' }, fond: { source: 'charte' as const }, accroche: '', gabarit: 'classique' as const, logos: [], captures: [], fichier: null };
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
  it('coche dans l’ordre des clics, décoche, et s’arrête à trois', () => {
    expect(basculer([], 'a')).toEqual(['a']);
    expect(basculer(['a', 'b'], 'a')).toEqual(['b']);
    expect(basculer(['a', 'b', 'c'], 'd')).toEqual(['a', 'b', 'c']);
  });
});

describe('gabaritsAutres', () => {
  it('donne les gabarits des autres vidéos qui ont une vignette', () => {
    const q = { nature: 'perso' as const, confidentielle: false };
    const vignette = (gabarit: 'vitrine' | 'mosaique') => ({
      pose: { source: 'banque' as const, fichier: 'a.jpg' }, fond: { source: 'charte' as const }, accroche: '', gabarit, logos: [], captures: [], fichier: null,
    });
    const p = {
      version: 2 as const, qualificationParDefaut: q,
      videos: [
        { ...videoParDefaut('complete', q), vignette: vignette('vitrine') },
        { ...videoParDefaut(1, q), vignette: vignette('mosaique') },
        videoParDefaut(2, q),
      ],
    };
    expect(gabaritsAutres(p, 1)).toEqual(['vitrine']);
    expect(gabaritsAutres(p, 2)).toEqual(['vitrine', 'mosaique']);
  });
});

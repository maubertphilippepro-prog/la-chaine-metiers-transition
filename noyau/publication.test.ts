import { describe, expect, it } from 'vitest';
import reglagesJson from '../reglages.json';
import {
  accorderPublication, appliquerModifications, cleVignette, fichierRendu, fichierVignette, imageCamera, imageEcran,
  longueurTags, mentionsTrouvees, modifierVideo, nomCible, poseDetouree, problemesPreparation, raisonPublication,
  urlsVignette, videoParDefaut, type Publication, type Vignette,
} from './publication';
import type { Reglages } from './types';

const R = (reglagesJson as Reglages).publication;
const VIGNETTE: Vignette = {
  pose: { source: 'banque', fichier: 'surpris.jpg' },
  fond: { source: 'ecran', instant: 12.3456 },
  accroche: 'Le presse-papiers caché',
  fichier: 'rendus/vignettes/complete.jpg',
};
const prete = (): Publication => ({
  version: 1,
  profilParDefaut: 'perso',
  videos: [{ ...videoParDefaut('complete', 'perso'), statut: 'prete', titre: 'Titre', description: 'Desc', tags: ['windows'], vignette: VIGNETTE }],
});

describe('accorderPublication', () => {
  it('crée une entrée par vidéo rendue, seule la vidéo complète cochée', () => {
    const p = accorderPublication(null, ['complete', 1, 2]);
    expect(p.profilParDefaut).toBe('perso');
    expect(p.videos.map(v => [v.cible, v.publier, v.statut])).toEqual([
      ['complete', true, 'a-preparer'], [1, false, 'a-preparer'], [2, false, 'a-preparer'],
    ]);
  });
  it('garde les entrées existantes, ajoute les nouvelles au profil par défaut et retire celles qui n’existent plus', () => {
    const avant: Publication = {
      version: 1, profilParDefaut: 'mixte', videos: [{ ...videoParDefaut(1, 'interne'), titre: 'Gardé' }, videoParDefaut(3, 'perso')],
    };
    expect(accorderPublication(avant, ['complete', 1]).videos.map(v => [v.cible, v.profil, v.titre])).toEqual([
      ['complete', 'mixte', ''], [1, 'interne', 'Gardé'],
    ]);
  });
});

describe('noms et chemins', () => {
  it('nomme les cibles, les rendus et les vignettes', () => {
    expect(nomCible('complete')).toBe('complete');
    expect(nomCible(3)).toBe('episode-03');
    expect(fichierRendu('complete', [])).toBe('video-complete.mp4');
    expect(fichierRendu(2, ['Intro', 'Le SSO'])).toBe('episode-02-le-sso.mp4');
    expect(fichierVignette(1)).toBe('rendus/vignettes/episode-01.jpg');
  });
  it('range les images de travail par instant en millisecondes', () => {
    expect(imageEcran(12.3456)).toBe('publication/images/ecran-12346.png');
    expect(imageCamera(1.5)).toEqual({ brute: 'publication/images/camera-1500.png', detouree: 'publication/images/camera-1500.detoure.png' });
    expect(poseDetouree('surpris.jpg')).toBe('surpris.detoure.png');
  });
  it('donne les adresses des images d’une vignette', () => {
    const bases = { tournage: 'http://f/essai', poses: 'http://p' };
    expect(urlsVignette(VIGNETTE, bases)).toEqual({ pose: 'http://p/surpris.detoure.png', fond: 'http://f/essai/publication/images/ecran-12346.png' });
    expect(urlsVignette({ ...VIGNETTE, pose: { source: 'camera', instant: 2 }, fond: { source: 'charte' } }, bases)).toEqual({
      pose: 'http://f/essai/publication/images/camera-2000.detoure.png', fond: null,
    });
  });
});

describe('raisonPublication', () => {
  it('accepte une publication bien formée', () => {
    expect(raisonPublication(prete())).toBeNull();
    expect(raisonPublication(accorderPublication(null, ['complete', 1]))).toBeNull();
  });
  it('refuse une forme invalide', () => {
    expect(raisonPublication({ ...prete(), version: 2 })).toBe('version 1 attendue');
    expect(raisonPublication({ ...prete(), profilParDefaut: 'pro' })).toBe('profilParDefaut invalide');
    const v = prete().videos[0]!;
    expect(raisonPublication({ ...prete(), videos: [{ ...v, cible: 0 }] })).toBe('videos[0] : cible invalide');
    expect(raisonPublication({ ...prete(), videos: [{ ...v, tags: 'a,b' }] })).toBe('videos[0] : tags doit être une liste de textes');
    expect(raisonPublication({ ...prete(), videos: [{ ...v, vignette: { ...VIGNETTE, pose: { source: 'banque', fichier: '../x.jpg' } } }] }))
      .toBe('videos[0] : vignette : pose invalide');
    expect(raisonPublication({ ...prete(), videos: [v, v] })).toBe('une vidéo apparaît deux fois');
  });
});

describe('appliquerModifications', () => {
  it('ramène à préparer une vidéo prête dont le titre change', () => {
    const p = appliquerModifications(prete(), modifierVideo(prete(), 'complete', { titre: 'Autre' }));
    expect(p.videos[0]!.statut).toBe('a-preparer');
  });
  it('garde prête une vidéo seulement décochée', () => {
    expect(appliquerModifications(prete(), modifierVideo(prete(), 'complete', { publier: false })).videos[0]!.statut).toBe('prete');
  });
  it('oublie le fichier de la vignette quand l’accroche change', () => {
    const p = appliquerModifications(prete(), modifierVideo(prete(), 'complete', { vignette: { ...VIGNETTE, accroche: 'Autre' } }));
    expect(p.videos[0]!.vignette!.fichier).toBeNull();
    expect(p.videos[0]!.statut).toBe('a-preparer');
  });
  it('ignore le statut, le fichier de vignette et l’état YouTube envoyés par le studio', () => {
    const triche = modifierVideo(prete(), 'complete', {
      statut: 'relayee', vignette: { ...VIGNETTE, fichier: 'autre.jpg' }, youtube: { id: 'x', visibilite: 'publique', programmeeLe: null, playlistId: null },
    });
    const v = appliquerModifications(prete(), triche).videos[0]!;
    expect(v.statut).toBe('prete');
    expect(v.vignette!.fichier).toBe('rendus/vignettes/complete.jpg');
    expect(v.youtube.id).toBeNull();
  });
  it('compare les vignettes sur la pose, le fond et l’accroche', () => {
    expect(cleVignette(VIGNETTE)).toBe(cleVignette({ ...VIGNETTE, fichier: null }));
    expect(cleVignette(VIGNETTE)).not.toBe(cleVignette({ ...VIGNETTE, fond: { source: 'charte' } }));
    expect(cleVignette(null)).toBe('');
  });
});

describe('problemesPreparation', () => {
  const v = prete().videos[0]!;
  it('accepte une vidéo complète', () => {
    expect(problemesPreparation(v, 'Desc', R, true)).toEqual([]);
  });
  it('signale titre, description, tags et vignette', () => {
    const vide = { ...v, titre: ' ', description: '', vignette: null };
    expect(problemesPreparation(vide, '', R, false)).toEqual(['Titre vide.', 'Description vide.', 'Vignette à composer.']);
    expect(problemesPreparation({ ...v, titre: 'x'.repeat(101) }, 'Desc', R, true)).toEqual(['Titre trop long : 101 caractères, 100 au plus.']);
    expect(problemesPreparation(v, 'x'.repeat(5001), R, true)).toEqual(['Description trop longue avec les chapitres : 5001 caractères, 5000 au plus.']);
    expect(problemesPreparation({ ...v, tags: ['x'.repeat(501)] }, 'Desc', R, true)).toEqual(['Tags trop longs : 501 caractères, 500 au plus.']);
    expect(problemesPreparation(v, 'Desc', R, false)).toEqual(['Vignette à rendre.']);
  });
  it('refuse une mention interdite dans une vidéo publique, pas dans une vidéo interne', () => {
    const mention = R.mentionsInterdites[0]!;
    const avec = { ...v, description: `Vidéo pour ${mention.toUpperCase()}.` };
    expect(problemesPreparation(avec, avec.description, R, true)).toEqual([`Mention interdite pour une vidéo publique : « ${mention} ».`]);
    expect(problemesPreparation({ ...avec, profil: 'interne' }, avec.description, R, true)).toEqual([]);
  });
  it('compte les tags comme YouTube : virgules et guillemets des tags à espaces', () => {
    expect(longueurTags(['ia', 'presse papiers'])).toBe(2 + 1 + 14 + 2);
    expect(longueurTags([])).toBe(0);
    expect(mentionsTrouvees(['Bonjour', 'ABC def'], ['abc', 'xyz'])).toEqual(['abc']);
  });
});

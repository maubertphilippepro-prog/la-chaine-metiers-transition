import { describe, expect, it } from 'vitest';
import reglagesJson from '../reglages.json';
import {
  accorderPublication, appliquerModifications, cleVignette, fichierRendu, fichierVignette, imageCamera, imageEcran,
  longueurTags, mentionsTrouvees, migrerPublication, modifierVideo, nomCible, poseDetouree, problemesPreparation, raisonPublication, retraitAFaire,
  proprietesVignette, videoParDefaut, type Publication, type Vignette,
} from './publication';
import type { Qualification } from './qualification';
import type { Reglages } from './types';

const R = (reglagesJson as Reglages).publication;
const PERSO: Qualification = { nature: 'perso', confidentielle: false };
const PRO: Qualification = { nature: 'pro', confidentielle: false };
const PRO_CONF: Qualification = { nature: 'pro', confidentielle: true };
const VIGNETTE: Vignette = {
  pose: { source: 'banque', fichier: 'surpris.jpg' },
  fond: { source: 'ecran', instant: 12.3456 },
  accroche: 'Le presse-papiers caché',
  gabarit: 'classique',
  logos: [],
  captures: [],
  fichier: 'rendus/vignettes/complete.jpg',
};
const prete = (): Publication => ({
  version: 2,
  qualificationParDefaut: PERSO,
  videos: [{ ...videoParDefaut('complete', PERSO), statut: 'prete', titre: 'Titre', description: 'Desc', tags: ['windows'], vignette: VIGNETTE }],
});

describe('accorderPublication', () => {
  it('crée une entrée par vidéo rendue, seule la vidéo complète cochée', () => {
    const p = accorderPublication(null, ['complete', 1, 2]);
    expect(p.qualificationParDefaut).toEqual(PERSO);
    expect(p.videos.map(v => [v.cible, v.publier, v.statut])).toEqual([
      ['complete', true, 'a-preparer'], [1, false, 'a-preparer'], [2, false, 'a-preparer'],
    ]);
  });
  it('garde les entrées existantes, ajoute les nouvelles à la qualification par défaut et retire celles qui n’existent plus', () => {
    const avant: Publication = {
      version: 2, qualificationParDefaut: PRO, videos: [{ ...videoParDefaut(1, PRO_CONF), titre: 'Gardé' }, videoParDefaut(3, PERSO)],
    };
    expect(accorderPublication(avant, ['complete', 1]).videos.map(v => [v.cible, v.nature, v.confidentielle, v.titre])).toEqual([
      ['complete', 'pro', false, ''], [1, 'pro', true, 'Gardé'],
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
  it('donne les propriétés de la composition : adresses des images et accroche nettoyée', () => {
    const bases = { tournage: 'http://f/essai', poses: 'http://p', logos: 'http://l' };
    expect(proprietesVignette({ ...VIGNETTE, accroche: ' Le presse-papiers caché ' }, bases)).toEqual({
      gabarit: 'classique',
      poseUrl: 'http://p/surpris.detoure.png',
      fondUrl: 'http://f/essai/publication/images/ecran-12346.png',
      logoUrls: [],
      captureUrls: [],
      accroche: 'Le presse-papiers caché',
    });
    const riche = proprietesVignette({
      ...VIGNETTE, gabarit: 'mosaique', pose: { source: 'camera', instant: 2 }, fond: { source: 'charte' },
      logos: ['power bi.svg'], captures: ['étape 1.png', 'b.jpg'],
    }, bases);
    expect(riche).toMatchObject({
      gabarit: 'mosaique',
      poseUrl: 'http://f/essai/publication/images/camera-2000.detoure.png',
      fondUrl: null,
      logoUrls: ['http://l/power%20bi.svg'],
      captureUrls: ['http://f/essai/captures/%C3%A9tape%201.png', 'http://f/essai/captures/b.jpg'],
    });
  });
});

describe('raisonPublication', () => {
  it('refuse un gabarit inconnu, trop de logos ou un nom de fichier avec un chemin', () => {
    const avec = (changement: Partial<Vignette>) => ({ ...prete(), videos: [{ ...prete().videos[0]!, vignette: { ...VIGNETTE, ...changement } }] });
    expect(raisonPublication(avec({ gabarit: 'autre' as never }))).toBe('videos[0] : vignette : gabarit invalide');
    expect(raisonPublication(avec({ logos: ['a.png', 'b.png', 'c.png', 'd.png'] }))).toBe('videos[0] : vignette : logos invalides');
    expect(raisonPublication(avec({ captures: ['../x.png'] }))).toBe('videos[0] : vignette : captures invalides');
    expect(raisonPublication(avec({ logos: ['excel.png'], captures: ['a.png', 'b.png'] }))).toBeNull();
  });
  it('exige la liste des logiciels', () => {
    const { logiciels: _, ...sans } = prete().videos[0]!;
    expect(raisonPublication({ ...prete(), videos: [sans] })).toBe('videos[0] : logiciels doit être une liste de textes');
  });
  it('accepte une publication bien formée', () => {
    expect(raisonPublication(prete())).toBeNull();
    expect(raisonPublication(accorderPublication(null, ['complete', 1]))).toBeNull();
  });
  it('refuse une forme invalide', () => {
    expect(raisonPublication({ ...prete(), version: 1 })).toBe('version 2 attendue');
    expect(raisonPublication({ ...prete(), qualificationParDefaut: { nature: 'interne', confidentielle: false } })).toBe('qualificationParDefaut invalide');
    expect(raisonPublication({ ...prete(), videos: [{ ...prete().videos[0]!, nature: 'mixte' }] })).toBe('videos[0] : nature invalide');
    expect(raisonPublication({ ...prete(), videos: [{ ...prete().videos[0]!, confidentielle: 'oui' }] }))
      .toBe('videos[0] : confidentielle doit être vrai ou faux');
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
  it('distingue deux vignettes par le gabarit, les logos et les captures', () => {
    expect(cleVignette(VIGNETTE)).not.toBe(cleVignette({ ...VIGNETTE, gabarit: 'vitrine' }));
    expect(cleVignette(VIGNETTE)).not.toBe(cleVignette({ ...VIGNETTE, logos: ['excel.png'] }));
    expect(cleVignette(VIGNETTE)).not.toBe(cleVignette({ ...VIGNETTE, captures: ['a.png'] }));
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
  it('refuse une mention interdite dans une vidéo envoyée sur YouTube, même privée ou non répertoriée, pas dans une vidéo Pro confidentielle', () => {
    const mention = R.mentionsInterdites[0]!;
    const avec = { ...v, description: `Vidéo pour ${mention.toUpperCase()}.` };
    expect(problemesPreparation(avec, avec.description, R, true)).toEqual([`Mention interdite pour une vidéo envoyée sur YouTube : « ${mention} ».`]);
    expect(problemesPreparation({ ...avec, ...PRO_CONF }, avec.description, R, true)).toEqual([]);
    for (const q of [PRO, { nature: 'perso' as const, confidentielle: true }]) {
      expect(problemesPreparation({ ...avec, ...q }, avec.description, R, true)).toHaveLength(1);
    }
  });
  it('cherche les mentions aussi dans l’accroche et dans les chapitres, sans tenir compte des accents', () => {
    const mention = R.mentionsInterdites[0]!;
    const attendu = [`Mention interdite pour une vidéo envoyée sur YouTube : « ${mention} ».`];
    const accroche = { ...v, vignette: { ...VIGNETTE, accroche: `Chez ${mention}` } };
    expect(problemesPreparation(accroche, 'Desc', R, true)).toEqual(attendu);
    expect(problemesPreparation(v, `Desc\n0:00 ${mention}`, R, true)).toEqual(attendu);
    const decomposee = mention.normalize('NFD').replace(/e/g, 'e\u0301');
    expect(problemesPreparation({ ...v, titre: decomposee }, 'Desc', R, true)).toEqual(attendu);
  });
  it('compte les tags comme YouTube : virgules et guillemets des tags à espaces', () => {
    expect(longueurTags(['ia', 'presse papiers'])).toBe(2 + 1 + 14 + 2);
    expect(longueurTags([])).toBe(0);
    expect(mentionsTrouvees(['Bonjour', 'ABC def'], ['abc', 'xyz'])).toEqual(['abc']);
  });
});

describe('migrerPublication', () => {
  const v1 = (profil: string) => {
    const { nature: _n, confidentielle: _c, ...base } = videoParDefaut('complete', PERSO);
    return { ...base, profil };
  };
  it('convertit une version 1 : profils en qualifications', () => {
    const p = migrerPublication({ version: 1, profilParDefaut: 'mixte', videos: [v1('interne'), { ...v1('perso'), cible: 1 }] }) as Publication;
    expect(p.version).toBe(2);
    expect(p.qualificationParDefaut).toEqual(PRO);
    expect(p.videos.map(v => [v.nature, v.confidentielle])).toEqual([['pro', true], ['perso', false]]);
    expect(p).not.toHaveProperty('profilParDefaut');
    expect(p.videos[0]).not.toHaveProperty('profil');
    expect(raisonPublication(p)).toBeNull();
  });
  it('complète une version 2 écrite avant les vignettes variées', () => {
    const { gabarit: _g, logos: _l, captures: _c, ...ancienne } = VIGNETTE;
    const { logiciels: _, ...video } = { ...videoParDefaut('complete', PERSO), vignette: ancienne };
    const p = migrerPublication({ version: 2, qualificationParDefaut: PERSO, videos: [video, { ...videoParDefaut(1, PERSO), logiciels: ['Excel'] }] }) as Publication;
    expect(p.videos[0]!.logiciels).toEqual([]);
    expect(p.videos[0]!.vignette).toEqual({ ...ancienne, gabarit: 'classique', logos: [], captures: [] });
    expect(p.videos[1]!.logiciels).toEqual(['Excel']);
    expect(p.videos[1]!.vignette).toBeNull();
    expect(raisonPublication(p)).toBeNull();
  });
  it('laisse une version 2 telle quelle, et un profil inconnu à raisonPublication', () => {
    const v2 = prete();
    expect(migrerPublication(v2)).toEqual(v2);
    expect(raisonPublication(migrerPublication({ version: 1, profilParDefaut: 'perso', videos: [v1('autre')] })))
      .toBe('videos[0] : nature invalide');
    expect(raisonPublication(migrerPublication({ version: 1, profilParDefaut: 'autre', videos: [] }))).toBe('qualificationParDefaut invalide');
  });
});

describe('requalification', () => {
  it('remet à préparer une vidéo prête dont la qualification change', () => {
    const p = prete();
    const q = appliquerModifications(p, modifierVideo(p, 'complete', PRO));
    expect(q.videos[0]).toMatchObject({ nature: 'pro', confidentielle: false, statut: 'a-preparer' });
  });
  it('signale un retrait du site à faire quand une vidéo sur le site n’y a plus sa place', () => {
    const v = { ...prete().videos[0]!, replit: { id: 42, categorieId: 1, playlistId: null } };
    expect(retraitAFaire(v)).toBe(true);
    expect(retraitAFaire({ ...v, ...PRO })).toBe(false);
    expect(retraitAFaire({ ...v, replit: { id: null, categorieId: null, playlistId: null } })).toBe(false);
  });
});

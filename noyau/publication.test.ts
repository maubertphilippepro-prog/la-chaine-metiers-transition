import { describe, expect, it } from 'vitest';
import reglagesJson from '../reglages.json';
import {
  accorderPublication, appliquerModifications, cleVignette, fichierRendu, fichierVignette, gabaritsAutres,
  longueurTags, mentionsTrouvees, migrerPublication, modifierVideo, nomCible, poseDetouree, problemesPreparation, raisonPublication, retraitAFaire,
  proprietesVignette, videoParDefaut, type ConsigneVignette, type Publication, type Vignette,
} from './publication';
import type { Qualification } from './qualification';
import type { Reglages } from './types';

const R = (reglagesJson as Reglages).publication;
const PERSO: Qualification = { nature: 'perso', confidentielle: false };
const PRO: Qualification = { nature: 'pro', confidentielle: false };
const PRO_CONF: Qualification = { nature: 'pro', confidentielle: true };
const VIGNETTE: Vignette = {
  pose: { source: 'banque', fichier: 'surpris.jpg' },
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
  it('nomme la pose détourée', () => {
    expect(poseDetouree('surpris.jpg')).toBe('surpris.detoure.png');
  });
  it('donne les propriétés de la composition : adresses des images et accroche nettoyée', () => {
    const bases = { tournage: 'http://f/essai', poses: 'http://p', logos: 'http://l' };
    expect(proprietesVignette({ ...VIGNETTE, accroche: ' Le presse-papiers caché ' }, bases)).toEqual({
      gabarit: 'classique',
      poseUrl: 'http://p/surpris.detoure.png',
      logoUrls: [],
      captureUrls: [],
      accroche: 'Le presse-papiers caché',
    });
    const riche = proprietesVignette({
      ...VIGNETTE, gabarit: 'mosaique', pose: { source: 'banque', fichier: 'ému.jpg' },
      logos: ['power bi.svg'], captures: ['étape 1.png', 'b.jpg'],
    }, bases);
    expect(riche).toEqual({
      gabarit: 'mosaique',
      poseUrl: 'http://p/%C3%A9mu.detoure.png',
      logoUrls: ['http://l/power%20bi.svg'],
      captureUrls: ['http://f/essai/captures/%C3%A9tape%201.png', 'http://f/essai/captures/b.jpg'],
      accroche: 'Le presse-papiers caché',
    });
  });
});

describe('raisonPublication', () => {
  it('refuse une pose caméra, plus prise en charge', () => {
    const v = { ...prete().videos[0]!, vignette: { ...VIGNETTE, pose: { source: 'camera', instant: 2 } } };
    expect(raisonPublication({ ...prete(), videos: [v] }))
      .toBe('videos[0] : vignette : pose caméra plus prise en charge, choisissez une pose de la banque');
  });
  it('refuse un gabarit inconnu, trop de logos ou un nom de fichier avec un chemin', () => {
    const avec = (changement: Partial<Vignette>) => ({ ...prete(), videos: [{ ...prete().videos[0]!, vignette: { ...VIGNETTE, ...changement } }] });
    expect(raisonPublication(avec({ gabarit: 'autre' as never }))).toBe('videos[0] : vignette : gabarit invalide');
    expect(raisonPublication(avec({ logos: ['a.png', 'b.png', 'c.png', 'd.png'] }))).toBe('videos[0] : vignette : logos invalides');
    expect(raisonPublication(avec({ captures: ['../x.png'] }))).toBe('videos[0] : vignette : captures invalides');
    expect(raisonPublication(avec({ captures: ['..\\x.png'] }))).toBe('videos[0] : vignette : captures invalides');
    expect(raisonPublication(avec({ pose: { source: 'banque', fichier: 'a\\b.jpg' } }))).toBe('videos[0] : vignette : pose invalide');
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
  it('compare les vignettes sur la pose et l’accroche', () => {
    expect(cleVignette(VIGNETTE)).toBe(cleVignette({ ...VIGNETTE, fichier: null }));
    expect(cleVignette(VIGNETTE)).not.toBe(cleVignette({ ...VIGNETTE, pose: { source: 'banque', fichier: 'autre.jpg' } }));
    expect(cleVignette(VIGNETTE)).not.toBe(cleVignette({ ...VIGNETTE, accroche: 'Autre' }));
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
  it('ignore le fond d’une vignette d’avant', () => {
    const video = { ...videoParDefaut('complete', PERSO), vignette: { ...VIGNETTE, fond: { source: 'ecran', instant: 3 } } };
    const p = migrerPublication({ version: 2, qualificationParDefaut: PERSO, videos: [video] }) as Publication;
    expect(p.videos[0]!.vignette).toEqual(VIGNETTE);
    expect(raisonPublication(p)).toBeNull();
  });
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

const CONSIGNE: ConsigneVignette = {
  texte: 'Mets en avant le planning',
  compris: 'Le planning au premier plan.',
  pasRealisable: [],
  propositions: [{ pose: 'surpris.jpg', logos: ['excel.png'], captures: ['planning.png'], gabarit: 'demonstration', accroche: 'Planning sans effort', explication: 'La capture du planning en grand.' }],
  choisie: 0,
};

describe('appliquerModifications et consignes de vignette', () => {
  const C2: ConsigneVignette = { ...CONSIGNE, texte: 'Seconde', propositions: [CONSIGNE.propositions[0]!, CONSIGNE.propositions[0]!], choisie: null };
  const avec = (consignes: ConsigneVignette[]): Publication => ({ ...prete(), videos: [{ ...prete().videos[0]!, consignesVignette: consignes }] });
  it('garde la liste du serveur : une sauvegarde périmée ne retire pas une consigne', () => {
    const p = appliquerModifications(avec([CONSIGNE, C2]), avec([CONSIGNE]));
    expect(p.videos[0]!.consignesVignette).toEqual([CONSIGNE, C2]);
  });
  it('applique le choix de proposition fait dans le studio', () => {
    const p = appliquerModifications(avec([CONSIGNE, C2]), avec([CONSIGNE, { ...C2, choisie: 1 }]));
    expect(p.videos[0]!.consignesVignette.map(c => c.choisie)).toEqual([0, 1]);
  });
  it('ignore un choix hors des propositions de la consigne', () => {
    const p = appliquerModifications(avec([CONSIGNE, C2]), avec([{ ...CONSIGNE, choisie: 1 }, { ...C2, choisie: 5 }]));
    expect(p.videos[0]!.consignesVignette.map(c => c.choisie)).toEqual([0, null]);
  });
  it('ignore le texte et les propositions envoyés par le studio', () => {
    const p = appliquerModifications(avec([CONSIGNE]), avec([{ ...CONSIGNE, texte: 'Autre', propositions: [] }]));
    expect(p.videos[0]!.consignesVignette).toEqual([CONSIGNE]);
  });
});

describe('captures candidates et consignes de vignette', () => {
  const avec = (changement: object) => ({ ...prete(), videos: [{ ...prete().videos[0]!, ...changement }] });
  it('part de listes vides, y compris à la lecture d’un fichier qui ne les a pas', () => {
    expect(videoParDefaut('complete', PERSO)).toMatchObject({ capturesCandidates: [], consignesVignette: [] });
    const { capturesCandidates: _, consignesVignette: __, ...ancienne } = prete().videos[0]!;
    const p = migrerPublication({ ...prete(), videos: [ancienne] }) as Publication;
    expect(p.videos[0]).toMatchObject({ capturesCandidates: [], consignesVignette: [] });
  });
  it('accepte 5 candidates et une consigne bien formée', () => {
    expect(raisonPublication(avec({ capturesCandidates: ['a.png', 'b.png', 'c.png', 'd.png', 'e.png'], consignesVignette: [CONSIGNE] }))).toBeNull();
    expect(raisonPublication(avec({ consignesVignette: [{ ...CONSIGNE, choisie: null }] }))).toBeNull();
  });
  it('refuse plus de 5 candidates ou un nom avec un chemin', () => {
    expect(raisonPublication(avec({ capturesCandidates: ['a', 'b', 'c', 'd', 'e', 'f'].map(f => `${f}.png`) })))
      .toBe('videos[0] : capturesCandidates invalides (5 au plus)');
    expect(raisonPublication(avec({ capturesCandidates: ['../a.png'] }))).toBe('videos[0] : capturesCandidates invalides (5 au plus)');
  });
  it('refuse une consigne mal formée', () => {
    const p = CONSIGNE.propositions[0]!;
    expect(raisonPublication(avec({ consignesVignette: 'non' }))).toBe('videos[0] : consignesVignette doit être une liste');
    expect(raisonPublication(avec({ consignesVignette: [{ ...CONSIGNE, compris: 3 }] })))
      .toBe('videos[0] : consignesVignette[0] : texte, compris et pasRealisable attendus');
    expect(raisonPublication(avec({ consignesVignette: [{ ...CONSIGNE, propositions: [], choisie: null }] })))
      .toBe('videos[0] : consignesVignette[0] : 1 à 3 propositions attendues');
    expect(raisonPublication(avec({ consignesVignette: [{ ...CONSIGNE, propositions: [p, p, p, p] }] })))
      .toBe('videos[0] : consignesVignette[0] : 1 à 3 propositions attendues');
    expect(raisonPublication(avec({ consignesVignette: [{ ...CONSIGNE, propositions: [{ ...p, gabarit: 'autre' }] }] })))
      .toBe('videos[0] : consignesVignette[0] : proposition invalide');
    expect(raisonPublication(avec({ consignesVignette: [{ ...CONSIGNE, propositions: [{ ...p, logos: ['a', 'b', 'c', 'd'] }] }] })))
      .toBe('videos[0] : consignesVignette[0] : proposition invalide');
    expect(raisonPublication(avec({ consignesVignette: [{ ...CONSIGNE, choisie: 1 }] })))
      .toBe('videos[0] : consignesVignette[0] : choisie invalide');
  });
});

describe('gabaritsAutres', () => {
  it('donne les gabarits des autres vidéos qui ont une vignette', () => {
    const q = { nature: 'perso' as const, confidentielle: false };
    const vignette = (gabarit: 'vitrine' | 'mosaique') => ({
      pose: { source: 'banque' as const, fichier: 'a.jpg' }, accroche: '', gabarit, logos: [], captures: [], fichier: null,
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

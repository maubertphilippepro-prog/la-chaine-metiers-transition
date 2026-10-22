import { describe, expect, it } from 'vitest';
import reglagesJson from '../reglages.json';
import { videoParDefaut, type VideoPubliee } from './publication';
import { corpsRelais, enregistrerRelais, enregistrerRetrait, problemesRelais, raisonLectureRelais, urlYoutube } from './relais';
import type { Qualification } from './qualification';
import type { Reglages } from './types';

const PRO: Qualification = { nature: 'pro', confidentielle: false };
const PRO_CONF: Qualification = { nature: 'pro', confidentielle: true };
const PERSO: Qualification = { nature: 'perso', confidentielle: false };

const R = (reglagesJson as Reglages).publication;
const ID = 'dQw4w9WgXcQ';
const video = (changement: Partial<VideoPubliee> = {}): VideoPubliee => ({
  ...videoParDefaut('complete', PRO_CONF),
  statut: 'prete',
  titre: ' Le SSO expliqué ',
  description: 'Desc',
  tags: ['sso'],
  vignette: { pose: { source: 'banque', fichier: 'a.jpg' }, fond: { source: 'charte' }, accroche: 'Un seul mot', fichier: 'rendus/vignettes/complete.jpg' },
  replit: { id: null, categorieId: 3, playlistId: 7 },
  ...changement,
});
const lienEnvoyee = (youtube: Partial<VideoPubliee['youtube']> = {}) => video({
  ...PRO, statut: 'envoyee-youtube', youtube: { id: ID, visibilite: 'non-repertoriee', programmeeLe: null, playlistId: null, ...youtube },
});
const ETAT = { rendu: { fichier: 'video-complete.mp4', present: true }, octetsVignette: 1000, siteConfigure: true };

describe('problemesRelais', () => {
  it('accepte une vidéo Pro confidentielle prête, envoyée ou déjà relayée', () => {
    for (const statut of ['prete', 'envoyee-youtube', 'relayee'] as const) expect(problemesRelais(video({ statut }), 'Desc', R, ETAT)).toEqual([]);
  });
  it('n’accepte une vidéo Pro non confidentielle qu’une fois l’envoi YouTube enregistré', () => {
    expect(problemesRelais(video({ ...PRO }), 'Desc', R, ETAT))
      .toEqual(['Enregistrez d’abord l’envoi sur YouTube : une vidéo Pro non confidentielle est relayée avec son lien YouTube.']);
    expect(problemesRelais(lienEnvoyee(), 'Desc', R, ETAT)).toEqual([]);
  });
  it('refuse une vidéo Perso', () => {
    expect(problemesRelais(video({ ...PERSO }), 'Desc', R, ETAT)).toEqual(['Une vidéo Perso n’est pas relayée sur le site.']);
  });
  it('reprend les contrôles avant envoi, exige la catégorie et un site configuré', () => {
    expect(problemesRelais(video({ statut: 'a-preparer', replit: { id: null, categorieId: null, playlistId: null } }), 'Desc', R, {
      rendu: { fichier: 'video-complete.mp4', present: false }, octetsVignette: 1000, siteConfigure: false,
    })).toEqual([
      'Vidéo pas encore validée pour la publication.',
      'Rendu absent : video-complete.mp4.',
      'Choisissez la catégorie du site.',
      'Site non configuré : renseignez REPLIT_SITE_URL et REPLIT_API_KEY dans .env, puis relancez le studio.',
    ]);
  });
  it('refuse une mention interdite pour une vidéo Pro non confidentielle, pas pour une vidéo Pro confidentielle', () => {
    const mention = R.mentionsInterdites[0]!;
    expect(problemesRelais(lienEnvoyee(), `Desc ${mention}`, R, ETAT)).toEqual([`Mention interdite pour une vidéo envoyée sur YouTube : « ${mention} ».`]);
    expect(problemesRelais(video(), `Desc ${mention}`, R, ETAT)).toEqual([]);
  });
});

describe('raisonLectureRelais', () => {
  const maintenant = new Date('2026-10-20T12:00:00Z');
  it('laisse passer une vidéo lisible publiquement', () => {
    expect(raisonLectureRelais(lienEnvoyee(), 'publique', maintenant)).toBeNull();
  });
  it('explique pourquoi une vidéo non lisible n’est pas encore relayée', () => {
    expect(raisonLectureRelais(lienEnvoyee(), 'non-publique', maintenant))
      .toBe('Vidéo pas encore lisible : passez-la en Non répertoriée dans YouTube Studio.');
    expect(raisonLectureRelais(lienEnvoyee(), 'inconnue', maintenant)).toBe('Vérification impossible : YouTube ne répond pas, réessayez plus tard.');
  });
});

describe('corpsRelais', () => {
  it('envoie le fichier d’une vidéo Pro confidentielle, réservée aux comptes autorisés', () => {
    expect(corpsRelais(video(), {
      dureeSecondes: 312.6, fichier: { videoObject: 'objet-video', videoUrl: null }, thumbnailObject: 'objet-vignette',
    })).toEqual({
      title: 'Le SSO expliqué', description: 'Desc', tags: ['sso'], categoryId: 3, playlistId: 7, durationSeconds: 313,
      format: 'long', status: 'published', visibility: 'interne', videoObject: 'objet-video', videoUrl: null, thumbnailObject: 'objet-vignette',
    });
  });
  it('intègre la vidéo YouTube d’une vidéo Pro non confidentielle, visible de tous, sans fichier', () => {
    const corps = corpsRelais(lienEnvoyee(), { dureeSecondes: 60, fichier: { videoUrl: urlYoutube(ID), videoObject: null }, thumbnailObject: 'v' });
    expect(corps).toMatchObject({ visibility: 'public', videoUrl: `https://www.youtube.com/watch?v=${ID}`, videoObject: null, thumbnailObject: 'v' });
  });
  it('refuse une vidéo sans catégorie', () => {
    expect(() => corpsRelais(video({ replit: { id: null, categorieId: null, playlistId: null } }),
      { dureeSecondes: 1, fichier: { videoObject: 'o', videoUrl: null }, thumbnailObject: 'v' })).toThrow('Catégorie du site manquante.');
  });
});

describe('enregistrerRelais', () => {
  it('passe la vidéo à relayée et garde l’identifiant du site', () => {
    expect(enregistrerRelais(video({ statut: 'envoyee-youtube' }), 42)).toEqual({
      statut: 'relayee', replit: { id: 42, categorieId: 3, playlistId: 7 }, erreur: null,
    });
  });
});

describe('enregistrerRetrait', () => {
  const relayee = (youtube: Partial<VideoPubliee['youtube']> = {}) => video({
    ...PERSO, statut: 'relayee', replit: { id: 42, categorieId: 3, playlistId: 7 }, youtube: { ...video().youtube, ...youtube },
    erreur: { etape: 'replit', message: 'x', le: '2026-10-22T10:00:00.000Z' },
  });
  it('efface la vidéo du site et ramène à prête, ou à envoyée si elle a une URL YouTube', () => {
    expect(enregistrerRetrait(relayee())).toEqual({ statut: 'prete', replit: { id: null, categorieId: null, playlistId: null }, erreur: null });
    expect(enregistrerRetrait(relayee({ id: ID })).statut).toBe('envoyee-youtube');
  });
  it('garde un statut autre que relayée', () => {
    expect(enregistrerRetrait({ ...relayee(), statut: 'a-preparer' }).statut).toBe('a-preparer');
  });
});

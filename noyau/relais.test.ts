import { describe, expect, it } from 'vitest';
import reglagesJson from '../reglages.json';
import { videoParDefaut, type VideoPubliee } from './publication';
import { corpsRelais, enregistrerRelais, problemesRelais, raisonLectureRelais, urlYoutube } from './relais';
import type { Reglages } from './types';

const R = (reglagesJson as Reglages).publication;
const ID = 'dQw4w9WgXcQ';
const video = (changement: Partial<VideoPubliee> = {}): VideoPubliee => ({
  ...videoParDefaut('complete', 'interne'),
  statut: 'prete',
  titre: ' Le SSO expliqué ',
  description: 'Desc',
  tags: ['sso'],
  vignette: { pose: { source: 'banque', fichier: 'a.jpg' }, fond: { source: 'charte' }, accroche: 'Un seul mot', fichier: 'rendus/vignettes/complete.jpg' },
  replit: { id: null, categorieId: 3, playlistId: 7 },
  ...changement,
});
const mixteEnvoyee = (youtube: Partial<VideoPubliee['youtube']> = {}) => video({
  profil: 'mixte', statut: 'envoyee-youtube', youtube: { id: ID, visibilite: 'publique', programmeeLe: null, playlistId: null, ...youtube },
});
const ETAT = { rendu: { fichier: 'video-complete.mp4', present: true }, octetsVignette: 1000, siteConfigure: true };

describe('problemesRelais', () => {
  it('accepte une vidéo Interne prête, envoyée ou déjà relayée', () => {
    for (const statut of ['prete', 'envoyee-youtube', 'relayee'] as const) expect(problemesRelais(video({ statut }), 'Desc', R, ETAT)).toEqual([]);
  });
  it('n’accepte une vidéo Mixte qu’une fois l’envoi YouTube enregistré', () => {
    expect(problemesRelais(video({ profil: 'mixte' }), 'Desc', R, ETAT))
      .toEqual(['Enregistrez d’abord l’envoi sur YouTube : une vidéo Mixte est relayée une fois en ligne.']);
    expect(problemesRelais(mixteEnvoyee(), 'Desc', R, ETAT)).toEqual([]);
  });
  it('refuse une vidéo Perso', () => {
    expect(problemesRelais(video({ profil: 'perso' }), 'Desc', R, ETAT)).toEqual(['Une vidéo Perso n’est pas relayée sur le site.']);
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
  it('refuse une mention interdite pour une vidéo Mixte, pas pour une vidéo Interne', () => {
    const mention = R.mentionsInterdites[0]!;
    expect(problemesRelais(mixteEnvoyee(), `Desc ${mention}`, R, ETAT)).toEqual([`Mention interdite pour une vidéo publique : « ${mention} ».`]);
    expect(problemesRelais(video(), `Desc ${mention}`, R, ETAT)).toEqual([]);
  });
});

describe('raisonLectureRelais', () => {
  const maintenant = new Date('2026-10-20T12:00:00Z');
  it('laisse passer une vidéo lisible publiquement', () => {
    expect(raisonLectureRelais(mixteEnvoyee(), 'publique', maintenant)).toBeNull();
  });
  it('fait attendre une vidéo programmée et explique les autres cas', () => {
    expect(raisonLectureRelais(mixteEnvoyee({ visibilite: 'programmee', programmeeLe: '2026-10-21T16:00:00.000Z' }), 'non-publique', maintenant))
      .toContain('pas encore en ligne');
    expect(raisonLectureRelais(mixteEnvoyee(), 'non-publique', maintenant))
      .toBe('Vidéo pas encore lisible publiquement : passez-la en public dans YouTube Studio, ou attendez l’heure programmée.');
    expect(raisonLectureRelais(mixteEnvoyee(), 'inconnue', maintenant)).toBe('Vérification impossible : YouTube ne répond pas, réessayez plus tard.');
  });
});

describe('corpsRelais', () => {
  it('envoie le fichier d’une vidéo Interne, réservée aux comptes autorisés', () => {
    expect(corpsRelais(video(), { dureeSecondes: 312.6, fichier: { videoObject: 'objet-video' }, thumbnailObject: 'objet-vignette' })).toEqual({
      title: 'Le SSO expliqué', description: 'Desc', tags: ['sso'], categoryId: 3, playlistId: 7, durationSeconds: 313,
      format: 'long', status: 'published', visibility: 'interne', videoObject: 'objet-video', thumbnailObject: 'objet-vignette',
    });
  });
  it('intègre la vidéo YouTube d’une vidéo Mixte, visible de tous', () => {
    const corps = corpsRelais(mixteEnvoyee(), { dureeSecondes: 60, fichier: { videoUrl: urlYoutube(ID) }, thumbnailObject: 'v' });
    expect(corps).toMatchObject({ visibility: 'public', videoUrl: `https://www.youtube.com/watch?v=${ID}`, thumbnailObject: 'v' });
    expect(corps).not.toHaveProperty('videoObject');
  });
  it('refuse une vidéo sans catégorie', () => {
    expect(() => corpsRelais(video({ replit: { id: null, categorieId: null, playlistId: null } }),
      { dureeSecondes: 1, fichier: { videoObject: 'o' }, thumbnailObject: 'v' })).toThrow('Catégorie du site manquante.');
  });
});

describe('enregistrerRelais', () => {
  it('passe la vidéo à relayée et garde l’identifiant du site', () => {
    expect(enregistrerRelais(video({ statut: 'envoyee-youtube' }), 42)).toEqual({
      statut: 'relayee', replit: { id: 42, categorieId: 3, playlistId: 7 }, erreur: null,
    });
  });
});

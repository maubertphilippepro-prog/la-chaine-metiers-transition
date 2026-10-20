import { describe, expect, it } from 'vitest';
import reglagesJson from '../reglages.json';
import { videoParDefaut, type VideoPubliee } from './publication';
import type { Reglages } from './types';
import {
  bilanLecture, dossierYoutube, enregistrerEnvoi, FORMES_URL, idYoutube, pretePourYoutube, problemesEnvoi, raisonEnvoi,
  textesYoutube, visibilitesIndiquees,
} from './youtube';

const R = (reglagesJson as Reglages).publication;
const ID = 'dQw4w9WgXcQ';
const prete = (changement: Partial<VideoPubliee> = {}): VideoPubliee => ({
  ...videoParDefaut('complete', 'perso'),
  statut: 'prete',
  titre: 'Le SSO expliqué',
  description: 'Desc',
  tags: ['sso', 'mot de passe'],
  vignette: { pose: { source: 'banque', fichier: 'a.jpg' }, fond: { source: 'charte' }, accroche: 'Un seul mot', fichier: 'rendus/vignettes/complete.jpg' },
  ...changement,
});
const RENDU = { fichier: 'video-complete.mp4', present: true };

describe('idYoutube', () => {
  it('reconnaît les formes d’URL acceptées et l’identifiant seul', () => {
    for (const url of [
      `https://www.youtube.com/watch?v=${ID}&t=42s`,
      `youtube.com/watch?v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}?si=abc`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://studio.youtube.com/video/${ID}/edit`,
      ` ${ID} `,
    ]) expect(idYoutube(url)).toBe(ID);
  });
  it('refuse toute autre chaîne', () => {
    for (const texte of ['', 'bonjour', `https://vimeo.com/${ID}`, 'https://www.youtube.com/watch?v=court', 'https://youtu.be/',
      'https://www.youtube.com/playlist?list=PL123', `https://www.youtube.com/@pmt`]) {
      expect(idYoutube(texte)).toBeNull();
    }
  });
  it('rappelle les formes acceptées', () => {
    expect(FORMES_URL).toContain('youtu.be/');
    expect(FORMES_URL).toContain('11 caractères');
  });
});

describe('visibilités et statuts', () => {
  it('indique Privée pour Interne, Publique ou Programmée sinon', () => {
    expect(visibilitesIndiquees('interne')).toEqual(['privee']);
    expect(visibilitesIndiquees('perso')).toEqual(['publique', 'programmee']);
    expect(visibilitesIndiquees('mixte')).toEqual(['publique', 'programmee']);
  });
  it('ne prépare que les vidéos cochées et validées', () => {
    expect(pretePourYoutube(prete())).toBe(true);
    expect(pretePourYoutube(prete({ statut: 'envoyee-youtube' }))).toBe(true);
    expect(pretePourYoutube(prete({ statut: 'relayee' }))).toBe(true);
    expect(pretePourYoutube(prete({ statut: 'a-preparer' }))).toBe(false);
    expect(pretePourYoutube(prete({ statut: 'erreur' }))).toBe(false);
    expect(pretePourYoutube(prete({ publier: false }))).toBe(false);
  });
  it('range le dossier par cible', () => {
    expect(dossierYoutube('complete')).toBe('publication/complete');
    expect(dossierYoutube(2)).toBe('publication/episode-02');
  });
});

describe('problemesEnvoi', () => {
  it('accepte une vidéo prête', () => {
    expect(problemesEnvoi(prete(), 'Desc', R, { rendu: RENDU, octetsVignette: 1000 })).toEqual([]);
  });
  it('reprend les contrôles de la préparation et y ajoute statut, rendu et poids de la vignette', () => {
    expect(problemesEnvoi(prete({ statut: 'a-preparer', publier: false }), 'Desc', R, {
      rendu: { fichier: 'video-complete.mp4', present: false }, octetsVignette: 2_000_001,
    })).toEqual([
      'Vidéo non cochée pour la publication.',
      'Vidéo pas encore validée pour la publication.',
      'Rendu absent : video-complete.mp4.',
      'Vignette trop lourde : 2000001 octets, 2000000 au plus.',
    ]);
    expect(problemesEnvoi(prete({ titre: '' }), 'Desc', R, { rendu: RENDU, octetsVignette: null })).toEqual(['Titre vide.', 'Vignette à rendre.']);
  });
});

describe('textesYoutube', () => {
  it('donne les champs à copier et les réglages d’une vidéo publique', () => {
    const t = textesYoutube(prete(), 'Desc\n\nChapitres :\n0:00 Intro', { playlist: 'Essai', cheminRendu: 'C:\\t\\rendus\\video-complete.mp4' });
    expect(t.titre).toBe('Le SSO expliqué');
    expect(t.description).toBe('Desc\n\nChapitres :\n0:00 Intro');
    expect(t.tags).toBe('sso, mot de passe');
    expect(t.reglages).toContain('Fichier vidéo : C:\\t\\rendus\\video-complete.mp4');
    expect(t.reglages).toContain('Visibilité : Publique, ou Programmée à la date voulue');
    expect(t.reglages).toContain('Catégorie : Science et technologie');
    expect(t.reglages).toContain('Langue de la vidéo : Français');
    expect(t.reglages).toContain('Non, cette vidéo n’est pas conçue pour les enfants');
    expect(t.reglages).toContain('Playlist : Essai');
  });
  it('indique Privée pour une vidéo Interne et omet la playlist si elle est seule', () => {
    const t = textesYoutube(prete({ profil: 'interne' }), 'Desc', { playlist: null, cheminRendu: 'x.mp4' });
    expect(t.reglages).toContain('Visibilité : Privée');
    expect(t.reglages).not.toContain('Playlist');
  });
});

describe('envoi', () => {
  const envoi = { id: ID, visibilite: 'publique' as const, programmeeLe: null };
  it('accepte un envoi conforme au profil', () => {
    expect(raisonEnvoi(prete(), envoi)).toBeNull();
    expect(raisonEnvoi(prete(), { id: ID, visibilite: 'programmee', programmeeLe: '2026-10-21T16:00:00.000Z' })).toBeNull();
    expect(raisonEnvoi(prete({ profil: 'interne' }), { ...envoi, visibilite: 'privee' })).toBeNull();
  });
  it('refuse une vidéo non validée, une visibilité contraire au profil et une date incohérente', () => {
    expect(raisonEnvoi(prete({ statut: 'a-preparer' }), envoi)).toBe('Validez d’abord la vidéo pour la publication.');
    expect(raisonEnvoi(prete({ profil: 'interne' }), envoi)).toBe('Une vidéo Interne reste privée sur YouTube.');
    expect(raisonEnvoi(prete(), { ...envoi, visibilite: 'privee' })).toBe('Une vidéo Perso ou Mixte est publique ou programmée sur YouTube.');
    expect(raisonEnvoi(prete(), { ...envoi, visibilite: 'programmee' })).toBe('Date et heure de mise en ligne attendues.');
    expect(raisonEnvoi(prete(), { ...envoi, visibilite: 'programmee', programmeeLe: 'demain' })).toBe('Date et heure de mise en ligne attendues.');
    expect(raisonEnvoi(prete(), { ...envoi, programmeeLe: '2026-10-21T16:00:00.000Z' })).toBe('Date de mise en ligne réservée à une vidéo programmée.');
  });
  it('passe la vidéo à envoyée et garde « relayée »', () => {
    expect(enregistrerEnvoi(prete(), envoi)).toEqual({
      statut: 'envoyee-youtube', youtube: { id: ID, visibilite: 'publique', programmeeLe: null, playlistId: null }, erreur: null,
    });
    expect(enregistrerEnvoi(prete({ statut: 'relayee' }), envoi).statut).toBe('relayee');
  });
});

describe('bilanLecture', () => {
  const maintenant = new Date('2026-10-20T12:00:00Z');
  const envoyee = (profil: VideoPubliee['profil'], youtube: Partial<VideoPubliee['youtube']> = {}) =>
    prete({ profil, statut: 'envoyee-youtube', youtube: { id: ID, visibilite: 'publique', programmeeLe: null, playlistId: null, ...youtube } });
  it('alerte si une vidéo Interne est lisible publiquement', () => {
    expect(bilanLecture(envoyee('interne', { visibilite: 'privee' }), 'publique', maintenant)).toEqual({
      alerte: true, message: 'Vidéo Interne lisible publiquement : passez-la en privé dans YouTube Studio.',
    });
    expect(bilanLecture(envoyee('interne', { visibilite: 'privee' }), 'non-publique', maintenant).alerte).toBe(false);
  });
  it('confirme une vidéo publique en ligne', () => {
    expect(bilanLecture(envoyee('mixte'), 'publique', maintenant)).toEqual({ alerte: false, message: 'Vidéo en ligne, lisible publiquement.' });
  });
  it('attend l’heure d’une vidéo programmée, alerte sinon', () => {
    const programmee = bilanLecture(envoyee('perso', { visibilite: 'programmee', programmeeLe: '2026-10-21T16:00:00.000Z' }), 'non-publique', maintenant);
    expect(programmee.alerte).toBe(false);
    expect(programmee.message).toContain('pas encore en ligne');
    expect(bilanLecture(envoyee('perso'), 'non-publique', maintenant)).toEqual({
      alerte: true, message: 'Vidéo pas encore lisible publiquement : passez-la en public dans YouTube Studio, ou attendez l’heure programmée.',
    });
  });
  it('signale une vérification impossible', () => {
    expect(bilanLecture(envoyee('perso'), 'inconnue', maintenant)).toEqual({
      alerte: true, message: 'Vérification impossible : YouTube ne répond pas, réessayez plus tard.',
    });
  });
});

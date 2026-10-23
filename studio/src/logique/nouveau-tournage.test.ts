import { describe, expect, it } from 'vitest';
import type { ResumeTournage } from '../../commun';
import { aujourdhui, etatTournage, LIBELLES_ETAPE, peutRemplacerVideo, peutSupprimer, raisonFichierVideo, titreParDefaut } from './nouveau-tournage';

const TOURNAGE: ResumeTournage = {
  nom: '2026-10-23-essai',
  titre: '2026-10-23-essai',
  statut: null,
  message: null,
  analyseFaite: false,
  videoPresente: false,
  analyseEnCours: false,
  etapeAnalyse: 'preparation',
};

describe('nouveau tournage', () => {
  it('accepte les vidéos du pipeline, quelle que soit la casse', () => {
    expect(raisonFichierVideo('Export Clipchamp.MP4')).toBeNull();
    expect(raisonFichierVideo('film.webm')).toBeNull();
  });
  it('refuse un autre fichier en le nommant', () => {
    expect(raisonFichierVideo('notes.txt')).toBe('« notes.txt » n’est pas une vidéo .mp4, .mkv, .mov ou .webm.');
    expect(raisonFichierVideo('sans-extension')).toBe('« sans-extension » n’est pas une vidéo .mp4, .mkv, .mov ou .webm.');
  });
  it('refuse l’enregistrement de la webcam', () => {
    const msg = '« moi-Camera.mp4 » est l’enregistrement de la webcam (-camera) : choisissez la vidéo exportée de Clipchamp.';
    expect(raisonFichierVideo('moi-Camera.mp4')).toBe(msg);
    expect(raisonFichierVideo('camera.mp4')).toBeNull();
  });
  it('refuse un nom que Windows n’accepte pas', () => {
    const msg = (n: string) => `« ${n} » : nom de fichier refusé par Windows, renommez la vidéo.`;
    for (const n of ['.cache.mp4', 'a:b.mp4', 'a?b.mp4', 'a"b.mp4', 'a|b.mp4', 'a*b.mp4', 'a<b.mp4', 'a>b.mp4', 'ab.mp4']) {
      expect(raisonFichierVideo(n)).toBe(msg(n));
    }
  });
  it('date du jour en heure locale', () => {
    expect(aujourdhui(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
  it('propose le titre d’episode.json, sinon le nom du dossier sans la date', () => {
    expect(titreParDefaut({ nom: '2026-10-23-essai', titre: 'Mon essai' })).toBe('Mon essai');
    expect(titreParDefaut({ nom: '2026-10-23-essai', titre: '2026-10-23-essai' })).toBe('essai');
  });
  it('nomme chaque étape', () => {
    expect(Object.values(LIBELLES_ETAPE)).toEqual(['Préparation de la vidéo', 'Transcription', 'Repérage des coupes', 'Suggestions de Claude']);
  });
  it('déduit ce que la liste montre', () => {
    expect(etatTournage(TOURNAGE)).toBe('video-manquante');
    expect(etatTournage({ ...TOURNAGE, videoPresente: true })).toBe('a-analyser');
    expect(etatTournage({ ...TOURNAGE, videoPresente: true, statut: 'erreur' })).toBe('erreur');
    expect(etatTournage({ ...TOURNAGE, videoPresente: true, statut: 'erreur', analyseEnCours: true })).toBe('en-cours');
    // Une erreur sans vidéo ne se relance pas : il faut d’abord la déposer.
    expect(etatTournage({ ...TOURNAGE, statut: 'erreur' })).toBe('video-manquante');
    // Un rendu en échec garde le tournage ouvrable, comme aujourd'hui.
    expect(etatTournage({ ...TOURNAGE, analyseFaite: true, statut: 'erreur' })).toBe('analyse');
  });
  it('propose de remplacer la vidéo d’un tournage en erreur au premier chargement seulement', () => {
    expect(peutRemplacerVideo({ ...TOURNAGE, videoPresente: true, statut: 'erreur' })).toBe(true);
    expect(peutRemplacerVideo({ ...TOURNAGE, videoPresente: true })).toBe(false);
    expect(peutRemplacerVideo({ ...TOURNAGE, analyseFaite: true, videoPresente: true, statut: 'erreur' })).toBe(false);
    expect(peutRemplacerVideo({ ...TOURNAGE, videoPresente: true, statut: 'erreur', analyseEnCours: true })).toBe(false);
  });
  it('ne supprime pas un tournage en cours d’analyse', () => {
    expect(peutSupprimer(TOURNAGE)).toBe(true);
    expect(peutSupprimer({ ...TOURNAGE, analyseEnCours: true })).toBe(false);
  });
});

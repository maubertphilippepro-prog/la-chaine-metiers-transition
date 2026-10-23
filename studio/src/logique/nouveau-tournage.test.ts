import { describe, expect, it } from 'vitest';
import type { ResumeTournage } from '../../commun';
import { aujourdhui, etatTournage, LIBELLES_ETAPE, raisonFichierVideo, titreParDefaut } from './nouveau-tournage';

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
    // Un rendu en échec garde le tournage ouvrable, comme aujourd'hui.
    expect(etatTournage({ ...TOURNAGE, analyseFaite: true, statut: 'erreur' })).toBe('analyse');
  });
});

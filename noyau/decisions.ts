import { decouperSegments, placerEncarts, plagesEpisodes } from './episodes';
import { dureeImages, enImages, segmentsEnImages, type SegmentImages } from './images';
import { calculerSegments } from './segments';
import type { Analyse, Montage, PositionEncart, Reglages, Terme } from './types';

// Toutes les positions et durées sont en images.
export interface EncartImages {
  terme: string;
  definition: string;
  position: PositionEncart;
  debut: number;
  duree: number;
}

export interface Partie {
  titre: string;
  segments: SegmentImages[];
  encarts: EncartImages[];
  duree: number;
}

export interface DureesHabillage {
  generique: number;
  intertitre: number;
  cartonFin: number;
  fonduAudio: number;
}

export interface DecisionsEpisode {
  fps: number;
  sourceUrl: string;
  titre: string;
  partie: Partie;
  durees: DureesHabillage;
}

export interface DecisionsVideoComplete {
  fps: number;
  sourceUrl: string;
  titre: string;
  parties: Partie[];
  durees: DureesHabillage;
}

export function dureesHabillage(r: Reglages, fps: number): DureesHabillage {
  return {
    generique: enImages(r.durees.generique, fps),
    intertitre: enImages(r.durees.intertitre, fps),
    cartonFin: enImages(r.durees.cartonFin, fps),
    fonduAudio: Math.max(1, enImages(r.coupe.fonduAudio, fps)),
  };
}

// Un encart qui dépasserait la fin est avancé ; s'il chevauche alors le précédent, il est retiré.
export function construirePartie(
  titre: string, segments: SegmentImages[], termes: Terme[], dureeEncart: number, fps: number,
): Partie {
  const duree = dureeImages(segments);
  const longueur = Math.min(dureeEncart, duree);
  const termesEnImages = termes.map(t => ({ ...t, occurrences: t.occurrences.map(o => o * fps) }));
  const encarts: EncartImages[] = [];
  if (longueur > 0) {
    for (const e of placerEncarts(termesEnImages, segments, dureeEncart)) {
      const debut = Math.min(Math.round(e.debut), duree - longueur);
      const precedent = encarts[encarts.length - 1];
      if (precedent && debut < precedent.debut + precedent.duree) continue;
      encarts.push({ terme: e.terme, definition: e.definition, position: e.position, debut, duree: longueur });
    }
  }
  return { titre, segments, encarts, duree };
}

function segmentsParChapitre(analyse: Analyse, montage: Montage, r: Reglages) {
  const segments = calculerSegments(analyse.duree, montage.coupes, r.coupe);
  return plagesEpisodes(montage.chapitres, analyse.duree).map(p => ({
    titre: p.titre,
    segments: segmentsEnImages(decouperSegments(segments, p), analyse.fps),
  }));
}

export function decisionsEpisodes(
  analyse: Analyse, montage: Montage, r: Reglages, sourceUrl: string,
): DecisionsEpisode[] {
  const fps = analyse.fps;
  const durees = dureesHabillage(r, fps);
  const dureeEncart = enImages(r.durees.encart, fps);
  return segmentsParChapitre(analyse, montage, r)
    .map(c => construirePartie(c.titre, c.segments, montage.termes, dureeEncart, fps))
    .filter(partie => partie.duree > 0)
    .map(partie => ({ fps, sourceUrl, titre: partie.titre, partie, durees }));
}

export function decisionsVideoComplete(
  analyse: Analyse, montage: Montage, r: Reglages, sourceUrl: string,
): DecisionsVideoComplete {
  const fps = analyse.fps;
  const dureeEncart = enImages(r.durees.encart, fps);
  const dejaDefinis = new Set<string>();
  const parties: Partie[] = [];
  for (const c of segmentsParChapitre(analyse, montage, r)) {
    const termes = montage.termes.filter(t => !dejaDefinis.has(t.terme));
    const partie = construirePartie(c.titre, c.segments, termes, dureeEncart, fps);
    if (partie.duree === 0) continue;
    partie.encarts.forEach(e => dejaDefinis.add(e.terme));
    parties.push(partie);
  }
  return { fps, sourceUrl, titre: montage.titre, parties, durees: dureesHabillage(r, fps) };
}

export function dureeEpisode(d: DecisionsEpisode): number {
  return d.durees.generique + d.partie.duree + d.durees.cartonFin;
}

export function dureeVideoComplete(d: DecisionsVideoComplete): number {
  const contenu = d.parties.reduce((total, p) => total + p.duree, 0);
  const intertitres = Math.max(0, d.parties.length - 1) * d.durees.intertitre;
  return d.durees.generique + contenu + intertitres + d.durees.cartonFin;
}

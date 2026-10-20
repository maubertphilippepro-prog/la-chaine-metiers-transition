import { decouperSegments, placerEncarts, plagesEpisodes } from './episodes';
import { dureeImages, enImages, segmentsEnImages, versImages, type SegmentImages } from './images';
import { calculerSegments } from './segments';
import { plageMontee } from './temps';
import type { Analyse, ElementEcran, Montage, PositionEncart, PositionTexte, Reglages, Terme, Zone } from './types';

// Toutes les positions et durées sont en images.
export interface EncartImages {
  terme: string;
  definition: string;
  position: PositionEncart;
  debut: number;
  duree: number;
}

// Élément validé, placé dans la partie.
export type ElementImages = { id: string; debut: number; duree: number } & (
  | { nature: 'zoom'; zone: Zone }
  | { nature: 'miseEnAvant'; zone: Zone }
  | { nature: 'texte'; texte: string; position: PositionTexte }
  | { nature: 'camera' }
);

export interface Partie {
  titre: string;
  segments: SegmentImages[];
  encarts: EncartImages[];
  // Termes validés et conservés dans la partie dont l'encart a été retiré (chevauchement).
  encartsRetires: string[];
  // Éléments à l'écran validés, triés par début.
  elements: ElementImages[];
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

// Les morceaux coupés d'un élément sont retirés ; ceux qui restent sont contigus dans la partie et forment
// une seule plage, si bien qu'un zoom reste stable à travers les jump cuts.
export function placerElements(elements: ElementEcran[], segments: SegmentImages[], fps: number): ElementImages[] {
  const places: ElementImages[] = [];
  for (const e of elements) {
    if (e.statut !== 'valide') continue;
    const plage = plageMontee(versImages(e.debut, fps), versImages(e.fin, fps), segments);
    if (!plage) continue;
    const debut = Math.round(plage.debut);
    const duree = Math.round(plage.fin) - debut;
    if (duree <= 0) continue;
    const place = { id: e.id, debut, duree };
    if (e.nature === 'texte') places.push({ ...place, nature: e.nature, texte: e.texte, position: e.position });
    else if (e.nature === 'camera') places.push({ ...place, nature: e.nature });
    else if (e.zone) places.push({ ...place, nature: e.nature, zone: e.zone });
  }
  return places.sort((a, b) => a.debut - b.debut);
}

// Un encart qui dépasserait la fin est avancé ; s'il chevauche alors le précédent, il est retiré.
export function construirePartie(
  titre: string, segments: SegmentImages[], termes: Terme[], dureeEncart: number, fps: number, elements: ElementEcran[] = [],
): Partie {
  const duree = dureeImages(segments);
  const longueur = Math.min(dureeEncart, duree);
  const termesEnImages = termes.map(t => ({ ...t, occurrences: t.occurrences.map(o => versImages(o, fps)) }));
  const encarts: EncartImages[] = [];
  const encartsRetires: string[] = [];
  if (longueur > 0) {
    for (const e of placerEncarts(termesEnImages, segments, dureeEncart)) {
      const debut = Math.min(Math.round(e.debut), duree - longueur);
      const precedent = encarts[encarts.length - 1];
      if (precedent && debut < precedent.debut + precedent.duree) {
        encartsRetires.push(e.terme);
        continue;
      }
      encarts.push({ terme: e.terme, definition: e.definition, position: e.position, debut, duree: longueur });
    }
  }
  return { titre, segments, encarts, encartsRetires, elements: placerElements(elements, segments, fps), duree };
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
    .map(c => construirePartie(c.titre, c.segments, montage.termes, dureeEncart, fps, montage.elements))
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
    const partie = construirePartie(c.titre, c.segments, termes, dureeEncart, fps, montage.elements);
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

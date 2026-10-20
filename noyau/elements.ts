import { decouperSegments, placerEncarts, plagesEpisodes } from './episodes';
import { calculerSegments } from './segments';
import { monteVersSource, plageMontee } from './temps';
import type { Analyse, ElementEcran, Montage, NatureElement, Reglages, Segment, Zone } from './types';

// Dimensions de source.mp4, auxquelles se rapportent les zones.
export const LARGEUR_SOURCE = 1920;
export const HAUTEUR_SOURCE = 1080;

export const LIBELLES_NATURE: Record<NatureElement, string> = {
  zoom: 'zoom',
  miseEnAvant: 'mise en avant',
  texte: 'texte incrusté',
  camera: 'caméra en grand',
};

export const ZONE_A_TRACER = 'La zone est à tracer.';

export type ReglagesElements = Pick<Reglages, 'elements' | 'coupe' | 'durees'>;

export interface ProblemeElement {
  id: string;
  probleme: string;
}

const DESIGNATIONS: Record<NatureElement, string> = {
  zoom: 'le zoom',
  miseEnAvant: 'la mise en avant',
  texte: 'le texte',
  camera: 'la caméra en grand',
};

const designation = (e: ElementEcran) => `${DESIGNATIONS[e.nature]} ${e.id}`;
const chevauche = (a: Segment, b: Segment) => a.debut < b.fin && b.debut < a.fin;
const estCadre = (e: ElementEcran) => e.nature === 'zoom' || e.nature === 'camera';

function problemeZone(zone: Zone, zoom: boolean, r: Reglages['elements']): string | null {
  const { x, y, largeur, hauteur } = zone;
  if (!(largeur > 0 && hauteur > 0) || x < 0 || y < 0 || x + largeur > LARGEUR_SOURCE || y + hauteur > HAUTEUR_SOURCE) {
    return 'La zone sort de l’image.';
  }
  if (zoom && Math.abs(hauteur - (largeur * 9) / 16) > 1) return 'La zone d’un zoom doit être en 16:9.';
  if (zoom && largeur < r.zoomLargeurMin) return `La zone d’un zoom doit faire au moins ${r.zoomLargeurMin} pixels de large.`;
  return null;
}

function problemeForme(e: ElementEcran, r: Reglages['elements']): string | null {
  if (!(e.fin > e.debut)) return 'Le passage est vide.';
  if (e.nature === 'texte') {
    if (!e.texte.trim()) return 'Le texte est vide.';
    if (e.texte.length > r.texteMaxCaracteres) return `Le texte dépasse ${r.texteMaxCaracteres} caractères.`;
  }
  if (e.nature === 'zoom' || e.nature === 'miseEnAvant') {
    // Une suggestion à valider peut attendre sa zone ; un élément validé, non.
    if (e.zone === null) return e.statut === 'valide' ? ZONE_A_TRACER : null;
    return problemeZone(e.zone, e.nature === 'zoom', r);
  }
  return null;
}

// La durée minimale s'applique à chaque épisode que l'élément traverse : le montage place les éléments épisode par épisode.
function problemeDuree(e: ElementEcran, analyse: Analyse, montage: Montage, segments: Segment[], dureeMin: number): string | null {
  const plages = plagesEpisodes(montage.chapitres, analyse.duree);
  const morceaux = plages.length ? plages.map(p => ({ plage: p, segs: decouperSegments(segments, p) })) : [{ plage: { debut: 0, fin: analyse.duree }, segs: segments }];
  let affiche = false;
  for (const { plage, segs } of morceaux) {
    const vue = plageMontee(Math.max(e.debut, plage.debut), Math.min(e.fin, plage.fin), segs);
    if (!vue) continue;
    affiche = true;
    if (vue.fin - vue.debut < dureeMin) return `Moins de ${dureeMin} s à l’écran une fois les coupes retirées.`;
  }
  return affiche ? null : 'Le passage est entièrement coupé.';
}

// Problème de `a` quand il chevauche `b`, ou null si les deux peuvent coexister.
function conflit(a: ElementEcran, b: ElementEcran): string | null {
  if (estCadre(a) && estCadre(b)) return `Chevauche ${designation(b)} : un seul zoom ou caméra en grand à la fois.`;
  if (a.nature === 'miseEnAvant' && estCadre(b)) return `Une mise en avant ne peut pas avoir lieu pendant ${designation(b)}.`;
  if (estCadre(a) && b.nature === 'miseEnAvant') return `Chevauche ${designation(b)}, qui ne correspondrait plus à l’image.`;
  if (a.nature === 'texte' && b.nature === 'texte' && a.position === b.position) {
    return `Chevauche ${designation(b)}, à la même position.`;
  }
  return null;
}

// Passages de la source couverts par un encart de définition placé en haut, d'après le placement des épisodes.
function encartsEnHaut(analyse: Analyse, montage: Montage, segments: Segment[], dureeEncart: number) {
  const encarts: { terme: string; passage: Segment }[] = [];
  for (const plage of plagesEpisodes(montage.chapitres, analyse.duree)) {
    const morceaux = decouperSegments(segments, plage);
    const derniere = morceaux[morceaux.length - 1];
    if (!derniere) continue;
    for (const e of placerEncarts(montage.termes, morceaux, dureeEncart)) {
      if (e.position !== 'haut') continue;
      const debut = monteVersSource(e.debut, morceaux);
      const fin = monteVersSource(e.debut + dureeEncart, morceaux) ?? derniere.fin;
      if (debut !== null) encarts.push({ terme: e.terme, passage: { debut, fin } });
    }
  }
  return encarts;
}

// Problèmes de chaque élément non écarté : forme, durée à l'écran, chevauchements. Un problème entre deux
// éléments est rapporté pour chacun d'eux. Fonction unique, utilisée par les consignes, les retouches du studio
// et le contrôle avant rendu.
export function problemesElements(analyse: Analyse, montage: Montage, r: ReglagesElements): ProblemeElement[] {
  const segments = calculerSegments(analyse.duree, montage.coupes, r.coupe);
  const actifs = montage.elements.filter(e => e.statut !== 'ecarte');
  const encarts = actifs.some(e => e.nature === 'texte' && e.position === 'haut-droite')
    ? encartsEnHaut(analyse, montage, segments, r.durees.encart)
    : [];
  const problemes: ProblemeElement[] = [];
  for (const e of actifs) {
    const forme = problemeForme(e, r.elements);
    if (forme) {
      problemes.push({ id: e.id, probleme: forme });
      continue;
    }
    const duree = problemeDuree(e, analyse, montage, segments, r.elements.dureeMin);
    if (duree) problemes.push({ id: e.id, probleme: duree });
    for (const autre of actifs) {
      if (autre === e || !chevauche(e, autre)) continue;
      const p = conflit(e, autre);
      if (p) problemes.push({ id: e.id, probleme: p });
    }
    if (e.nature === 'texte' && e.position === 'haut-droite') {
      const encart = encarts.find(x => chevauche(e, x.passage));
      if (encart) {
        problemes.push({ id: e.id, probleme: `Un texte en haut à droite ne peut pas paraître pendant l’encart « ${encart.terme} ».` });
      }
    }
  }
  return problemes;
}

// Premier problème de l'élément désigné (après une création ou une retouche), ou null.
export function problemeDe(analyse: Analyse, montage: Montage, id: string, r: ReglagesElements): string | null {
  return problemesElements(analyse, montage, r).find(p => p.id === id)?.probleme ?? null;
}

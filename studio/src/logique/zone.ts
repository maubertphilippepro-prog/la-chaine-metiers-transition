import { HAUTEUR_SOURCE, LARGEUR_SOURCE } from '../../../noyau/elements';
import type { Zone } from '../../../noyau/types';

export interface Point {
  x: number;
  y: number;
}

// Rectangle de l'aperçu à l'écran (getBoundingClientRect).
export interface Cadre {
  left: number;
  top: number;
  width: number;
  height: number;
}

const borne = (v: number, max: number) => Math.min(max, Math.max(0, v));

// Point de l'aperçu (coordonnées de la page) en pixels de la source, borné à l'image.
export function versSource(clientX: number, clientY: number, cadre: Cadre): Point {
  return {
    x: borne(((clientX - cadre.left) / cadre.width) * LARGEUR_SOURCE, LARGEUR_SOURCE),
    y: borne(((clientY - cadre.top) / cadre.height) * HAUTEUR_SOURCE, HAUTEUR_SOURCE),
  };
}

// Rectangle tiré de `depart` vers `arrivee`, en pixels entiers. Pour un zoom : 16:9, au moins `largeurMin`
// de large, la largeur suivant le geste le plus ample, ancré au départ dans le sens du geste puis ramené dans l'image.
export function rectangleTrace(depart: Point, arrivee: Point, zoom: boolean, largeurMin: number): Zone {
  if (!zoom) {
    const x = Math.round(Math.min(depart.x, arrivee.x));
    const y = Math.round(Math.min(depart.y, arrivee.y));
    return {
      x,
      y,
      largeur: Math.round(Math.max(depart.x, arrivee.x)) - x,
      hauteur: Math.round(Math.max(depart.y, arrivee.y)) - y,
    };
  }
  const dx = arrivee.x - depart.x;
  const dy = arrivee.y - depart.y;
  const largeur = Math.round(Math.min(LARGEUR_SOURCE, Math.max(Math.abs(dx), (Math.abs(dy) * 16) / 9, largeurMin)));
  const hauteur = Math.round((largeur * 9) / 16);
  const x0 = dx < 0 ? depart.x - largeur : depart.x;
  const y0 = dy < 0 ? depart.y - hauteur : depart.y;
  return {
    x: Math.round(Math.min(Math.max(0, x0), LARGEUR_SOURCE - largeur)),
    y: Math.round(Math.min(Math.max(0, y0), HAUTEUR_SOURCE - hauteur)),
    largeur,
    hauteur,
  };
}

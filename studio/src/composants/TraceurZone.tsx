import { type FC, type PointerEvent, useRef, useState } from 'react';
import { HAUTEUR_SOURCE, LARGEUR_SOURCE } from '../../../noyau/elements';
import type { Zone } from '../../../noyau/types';
import { rectangleTrace, versSource, type Point } from '../logique/zone';

// Ce que la zone tracée complète : un élément à créer, un élément existant ou une proposition de consigne.
export type CibleDessin =
  | { genre: 'nouveau'; fin: number }
  | { genre: 'element'; id: string }
  | { genre: 'proposition'; idConsigne: string; indice: number };

export interface Dessin {
  nature: 'zoom' | 'miseEnAvant';
  // Instant de la source où l'aperçu est mis en pause.
  debut: number;
  cible: CibleDessin;
}

interface Props {
  dessin: Dessin;
  largeurMin: number;
  // Renvoie le problème qui empêche d'enregistrer la zone, ou null.
  valider: (zone: Zone) => string | null;
  onFin: () => void;
}

const enPourcent = (v: number, total: number) => `${(v / total) * 100}%`;

// Calque posé sur l'aperçu en pause : l'auteur tire un rectangle à la souris (16:9 pour un zoom).
export const TraceurZone: FC<Props> = ({ dessin, largeurMin, valider, onFin }) => {
  const calque = useRef<HTMLDivElement>(null);
  const [depart, setDepart] = useState<Point | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [probleme, setProbleme] = useState<string | null>(null);
  const zoom = dessin.nature === 'zoom';

  const point = (e: PointerEvent): Point | null => {
    const cadre = calque.current?.getBoundingClientRect();
    return cadre ? versSource(e.clientX, e.clientY, cadre) : null;
  };
  const commencer = (e: PointerEvent<HTMLDivElement>) => {
    const p = point(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDepart(p);
    setZone(rectangleTrace(p, p, zoom, largeurMin));
    setProbleme(null);
  };
  const deplacer = (e: PointerEvent) => {
    const p = point(e);
    if (depart && p) setZone(rectangleTrace(depart, p, zoom, largeurMin));
  };
  const enregistrer = () => {
    if (!zone) return;
    const p = valider(zone);
    if (p) setProbleme(p);
    else onFin();
  };

  return (
    <div ref={calque} className="traceur" onPointerDown={commencer} onPointerMove={deplacer} onPointerUp={() => setDepart(null)}>
      {zone && (
        <div
          className="traceur-zone"
          style={{
            left: enPourcent(zone.x, LARGEUR_SOURCE),
            top: enPourcent(zone.y, HAUTEUR_SOURCE),
            width: enPourcent(zone.largeur, LARGEUR_SOURCE),
            height: enPourcent(zone.hauteur, HAUTEUR_SOURCE),
          }}
        />
      )}
      <div className="traceur-barre" onPointerDown={e => e.stopPropagation()}>
        <span>{zoom ? 'Tracez la zone à agrandir (16:9).' : 'Tracez la zone à mettre en avant.'}</span>
        <button className="principal" disabled={!zone || zone.largeur === 0 || zone.hauteur === 0} onClick={enregistrer}>
          Valider
        </button>
        <button onClick={onFin}>Annuler</button>
        {probleme && <span className="trop-long">{probleme}</span>}
      </div>
    </div>
  );
};

import { type FC, type MouseEvent, useMemo, useState } from 'react';
import {
  ajouterChapitre, basculerCoupe, couperPassage, deplacerLimite, fusionnerChapitre, renommerChapitre,
} from '../../../noyau/edition';
import type { Analyse, Coupe, Montage, TypeCoupe } from '../../../noyau/types';
import { duree, horodatage } from '../logique/format';
import { construireTexte, type ElementTexte } from '../logique/texte';

type Choix = { genre: 'mots'; debut: number; fin: number; rangs: [number, number] } | { genre: 'coupe'; id: string };

interface Props {
  analyse: Analyse;
  montage: Montage;
  modifier: (f: (m: Montage) => Montage) => void;
  ecouter: (debut: number, fin: number) => void;
  lireDansApercu: (t: number) => void;
}

export const LIBELLES_COUPE: Record<TypeCoupe, string> = {
  silence: 'silence',
  hesitation: 'hésitation',
  repetition: 'répétition',
  prise: 'prise ratée',
  longueur: 'longueur',
  manuelle: 'coupe manuelle',
};

function classeCoupe(c: Coupe | null): string {
  if (!c) return '';
  return `${c.active ? 'coupe-active' : c.enAttente ? 'coupe-attente' : 'coupe-retablie'} type-${c.type}`;
}

// Texte horodaté : clic sur un mot ou un trou pour le choisir, glisser pour choisir un passage.
export const Texte: FC<Props> = ({ analyse, montage, modifier, ecouter, lireDansApercu }) => {
  const blocs = useMemo(() => construireTexte(analyse, montage), [analyse, montage]);
  const rangs = useMemo(() => new Map(analyse.mots.map((m, i) => [m.id, i])), [analyse]);
  const coupesDesMots = useMemo(() => {
    const carte = new Map<number, Coupe | null>();
    for (const b of blocs) for (const e of b.elements) if (e.genre === 'mot') carte.set(e.mot.id, e.coupe);
    return carte;
  }, [blocs]);
  const [choix, setChoix] = useState<Choix | null>(null);
  const coupe = choix?.genre === 'coupe' ? montage.coupes.find(c => c.id === choix.id) ?? null : null;
  const paroles = coupe ? analyse.detections.find(d => d.id === coupe.id)?.paroles : undefined;

  const choisirMots = (r1: number, r2: number) => {
    const [a, b] = r1 <= r2 ? [r1, r2] : [r2, r1];
    const premier = analyse.mots[a];
    const dernier = analyse.mots[b];
    if (premier && dernier) setChoix({ genre: 'mots', debut: premier.debut, fin: dernier.fin, rangs: [a, b] });
  };

  const choisir = (e: MouseEvent) => {
    const element = (n: Node | null) =>
      (n instanceof Element ? n : n?.parentElement)?.closest<HTMLElement>('[data-mot],[data-coupe]') ?? null;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      const a = rangs.get(Number(element(selection.anchorNode)?.dataset.mot));
      const b = rangs.get(Number(element(selection.focusNode)?.dataset.mot));
      if (a !== undefined && b !== undefined) {
        choisirMots(a, b);
        return;
      }
    }
    const cible = element(e.target as Node);
    if (!cible) {
      setChoix(null);
    } else if (cible.dataset.coupe !== undefined) {
      setChoix({ genre: 'coupe', id: cible.dataset.coupe });
    } else {
      const id = Number(cible.dataset.mot);
      const c = coupesDesMots.get(id);
      const r = rangs.get(id);
      if (c) setChoix({ genre: 'coupe', id: c.id });
      else if (r !== undefined) choisirMots(r, r);
    }
  };

  const estChoisi = (e: ElementTexte) => {
    if (choix?.genre === 'coupe') return (e.genre === 'trou' ? e.coupe.id : e.coupe?.id) === choix.id;
    if (choix?.genre === 'mots' && e.genre === 'mot') {
      const r = rangs.get(e.mot.id) ?? -1;
      return r >= choix.rangs[0] && r <= choix.rangs[1];
    }
    return false;
  };

  const rendreElement = (e: ElementTexte) =>
    e.genre === 'mot' ? (
      <span
        key={`m${e.mot.id}`}
        data-mot={e.mot.id}
        title={e.terme ?? undefined}
        className={['mot', classeCoupe(e.coupe), e.terme ? 'terme' : '', estChoisi(e) ? 'choisi' : ''].join(' ')}
      >
        {e.mot.texte}{' '}
      </span>
    ) : (
      <span
        key={`c${e.coupe.id}`}
        data-coupe={e.coupe.id}
        className={['trou', classeCoupe(e.coupe), estChoisi(e) ? 'choisi' : ''].join(' ')}
      >
        {LIBELLES_COUPE[e.coupe.type]} {duree(e.coupe.fin - e.coupe.debut)}
      </span>
    );

  return (
    <>
      <div className="barre-selection">
        {!choix && <span className="discret">Cliquez un mot ou un passage coupé, ou sélectionnez un passage.</span>}
        {choix?.genre === 'mots' && (
          <>
            <span>{horodatage(choix.debut)} · {duree(choix.fin - choix.debut)}</span>
            <button onClick={() => { modifier(m => couperPassage(m, choix.debut, choix.fin)); setChoix(null); }}>Couper</button>
            <button onClick={() => ecouter(choix.debut, choix.fin)}>Écouter</button>
            <button onClick={() => lireDansApercu(choix.debut)}>Lire dans l’aperçu</button>
            <button onClick={() => modifier(m => ajouterChapitre(m, choix.debut, 'Nouveau chapitre'))}>Nouveau chapitre ici</button>
          </>
        )}
        {coupe && (
          <>
            <span className={`type-${coupe.type}`}>{LIBELLES_COUPE[coupe.type]} · {duree(coupe.fin - coupe.debut)}</span>
            {paroles && <em>entendu : « {paroles} »</em>}
            {coupe.enAttente
              ? <span className="discret">à décider dans « Longueurs proposées »</span>
              : <button onClick={() => modifier(m => basculerCoupe(m, coupe.id))}>{coupe.active ? 'Rétablir' : 'Couper'}</button>}
            <button onClick={() => ecouter(coupe.debut, coupe.fin)}>Écouter le passage</button>
            <button onClick={() => lireDansApercu(coupe.debut)}>Lire dans l’aperçu</button>
          </>
        )}
      </div>
      <div>
        {blocs.map(b => (
          <section key={b.index}>
            <div className="chapitre">
              <span className="discret">{horodatage(b.debut)}</span>
              <input
                value={b.titre}
                aria-label={`Titre du chapitre ${b.index + 1}`}
                onChange={e => { const titre = e.target.value; modifier(m => renommerChapitre(m, b.index, titre)); }}
              />
              {b.debut > 0 && (
                <>
                  <button
                    disabled={choix?.genre !== 'mots'}
                    title="Fait commencer ce chapitre au passage choisi"
                    onClick={() => { if (choix?.genre === 'mots') modifier(m => deplacerLimite(m, b.index, choix.debut)); }}
                  >
                    Commencer ici
                  </button>
                  <button onClick={() => modifier(m => fusionnerChapitre(m, b.index))}>Fusionner avec le précédent</button>
                </>
              )}
            </div>
            <p onMouseUp={choisir}>{b.elements.map(rendreElement)}</p>
          </section>
        ))}
      </div>
    </>
  );
};

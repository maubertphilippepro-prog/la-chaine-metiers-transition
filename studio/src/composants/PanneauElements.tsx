import { type FC, useEffect, useMemo, useState } from 'react';
import { extraitPassage, motsRecouverts, passageEnTemps, type Ancrage } from '../../../noyau/consignes';
import { modifierElement, supprimerElement, type ChangementElement } from '../../../noyau/edition';
import { LIBELLES_NATURE, problemesElements, type ReglagesElements } from '../../../noyau/elements';
import type { Analyse, ElementEcran, Montage, StatutElement } from '../../../noyau/types';
import { elementsAffiches } from '../logique/elements';
import { horodatage } from '../logique/format';
import { ChoixPosition } from './ChoixPosition';

interface Props {
  analyse: Analyse;
  montage: Montage;
  reglages: ReglagesElements;
  selection: Ancrage | null;
  // Applique la retouche si l'élément respecte les règles ; renvoie sinon le problème.
  retoucher: (id: string, f: (m: Montage) => Montage) => string | null;
  tracer: (e: ElementEcran) => void;
  ecouter: (debut: number, fin: number) => void;
  lireDansApercu: (t: number) => void;
}

const LIBELLES_STATUT: Record<StatutElement, string> = { 'a-valider': 'à valider', valide: 'validé', ecarte: 'écarté' };
const EXTRAIT_MAX = 50;

type ElementTexteIncruste = Extract<ElementEcran, { nature: 'texte' }>;

// Le texte n'est appliqué qu'en quittant le champ (ou avec Entrée) : un champ vidé pour être retapé n'est pas refusé.
const EditionTexte: FC<{ element: ElementTexteIncruste; max: number; changer: (c: ChangementElement) => void }> = ({
  element, max, changer,
}) => {
  const [brouillon, setBrouillon] = useState(element.texte);
  useEffect(() => setBrouillon(element.texte), [element.texte]);
  const appliquer = () => {
    if (brouillon !== element.texte) changer({ texte: brouillon });
  };
  return (
    <div className="actions">
      <input
        value={brouillon}
        maxLength={max}
        aria-label={`Texte de l’élément ${element.id}`}
        onChange={e => setBrouillon(e.target.value)}
        onBlur={appliquer}
        onKeyDown={e => { if (e.key === 'Enter') appliquer(); }}
      />
      <ChoixPosition valeur={element.position} onChange={position => changer({ position })} />
    </div>
  );
};

// Éléments non écartés, par ordre d'apparition ; chaque retouche passe par les règles.
export const PanneauElements: FC<Props> = props => {
  const { analyse, montage, reglages, selection } = props;
  const [refus, setRefus] = useState<{ id: string; probleme: string } | null>(null);
  const problemes = useMemo(() => problemesElements(analyse, montage, reglages), [analyse, montage, reglages]);
  const raisons = useMemo(
    () => new Map((analyse.suggestions?.elements ?? []).map(s => [s.id, s.raison])),
    [analyse],
  );
  const affiches = elementsAffiches(montage);
  const aValider = affiches.filter(e => e.statut === 'a-valider').length;

  const agir = (id: string, f: (m: Montage) => Montage) => {
    const probleme = props.retoucher(id, f);
    setRefus(probleme ? { id, probleme } : null);
  };

  return (
    <section className="panneau">
      <h3>Éléments à l’écran ({aValider} à valider)</h3>
      {affiches.length === 0 && (
        <p className="discret">Aucun élément. Sélectionnez un passage dans le texte pour zoomer, mettre en avant, incruster un texte ou passer la caméra en grand.</p>
      )}
      {affiches.map(e => {
        const mots = motsRecouverts(analyse, e);
        const raison = raisons.get(e.id);
        const aZone = e.nature === 'zoom' || e.nature === 'miseEnAvant';
        const sansZone = aZone && e.zone === null;
        const changer = (c: ChangementElement) => agir(e.id, m => modifierElement(m, e.id, c));
        const recaler = () => {
          if (!selection) return;
          const p = passageEnTemps(analyse, selection.premierMot, selection.dernierMot);
          if (typeof p === 'string') setRefus({ id: e.id, probleme: p });
          else changer({ debut: p.debut, fin: p.fin });
        };
        return (
          <div key={e.id} className="fiche">
            <div>
              <strong>{LIBELLES_NATURE[e.nature]}</strong>
              {' · '}
              <span className={e.statut === 'a-valider' ? 'trop-long' : 'discret'}>{LIBELLES_STATUT[e.statut]}</span>
              <span className="discret">
                {' · '}{horodatage(e.debut)} · {mots ? `« ${extraitPassage(analyse, mots, EXTRAIT_MAX)} »` : 'aucun mot'}
              </span>
            </div>
            {raison && <div className="discret">Suggéré : {raison}</div>}
            {sansZone && <div className="trop-long">Zone à tracer.</div>}
            {problemes.filter(p => p.id === e.id).map(p => <div key={p.probleme} className="trop-long">{p.probleme}</div>)}
            {e.nature === 'texte' && <EditionTexte element={e} max={reglages.elements.texteMaxCaracteres} changer={changer} />}
            {refus?.id === e.id && <div className="alerte">{refus.probleme}</div>}
            <div className="actions">
              {e.statut === 'a-valider' && (
                <>
                  <button disabled={sansZone} title={sansZone ? 'Tracez d’abord la zone' : undefined} onClick={() => changer({ statut: 'valide' })}>
                    Accepter
                  </button>
                  <button onClick={() => changer({ statut: 'ecarte' })}>Écarter</button>
                </>
              )}
              {aZone && <button onClick={() => props.tracer(e)}>{sansZone ? 'Tracer' : 'Retracer'}</button>}
              <button onClick={() => props.ecouter(e.debut, e.fin)}>Écouter</button>
              <button onClick={() => props.lireDansApercu(e.debut)}>Voir dans l’aperçu</button>
              <button disabled={!selection} title="Reprend le passage sélectionné dans le texte" onClick={recaler}>
                Recaler sur la sélection
              </button>
              <button onClick={() => agir(e.id, m => supprimerElement(m, e.id))}>Supprimer</button>
            </div>
          </div>
        );
      })}
    </section>
  );
};

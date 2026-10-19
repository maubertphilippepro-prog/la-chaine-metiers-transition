import type { FC } from 'react';
import { basculerCoupe, deciderLongueur } from '../../../noyau/edition';
import type { Coupe, Montage, SuggestionLongueur } from '../../../noyau/types';
import { duree, horodatage } from '../logique/format';

interface Props {
  coupes: Coupe[];
  suggestions: SuggestionLongueur[];
  modifier: (f: (m: Montage) => Montage) => void;
  ecouter: (debut: number, fin: number) => void;
  lireDansApercu: (t: number) => void;
}

// Passages trop longs proposés par Claude : rien n'est coupé tant qu'ils ne sont pas acceptés.
export const PanneauLongueurs: FC<Props> = ({ coupes, suggestions, modifier, ecouter, lireDansApercu }) => {
  const longueurs = coupes.filter(c => c.type === 'longueur');
  if (longueurs.length === 0) return null;
  return (
    <section className="panneau">
      <h3>Longueurs proposées ({longueurs.filter(c => c.enAttente).length} en attente)</h3>
      {longueurs.map(c => (
        <div key={c.id} className="fiche">
          <div>
            {horodatage(c.debut)} · {duree(c.fin - c.debut)} ·{' '}
            <strong>{c.enAttente ? 'en attente' : c.active ? 'coupé' : 'gardé'}</strong>
          </div>
          <div className="discret">{suggestions.find(s => s.id === c.id)?.raison}</div>
          <div className="actions">
            {c.enAttente ? (
              <>
                <button onClick={() => modifier(m => deciderLongueur(m, c.id, true))}>Couper</button>
                <button onClick={() => modifier(m => deciderLongueur(m, c.id, false))}>Garder</button>
              </>
            ) : (
              <button onClick={() => modifier(m => basculerCoupe(m, c.id))}>{c.active ? 'Garder finalement' : 'Couper finalement'}</button>
            )}
            <button onClick={() => ecouter(c.debut, c.fin)}>Écouter</button>
            <button onClick={() => lireDansApercu(c.debut)}>Lire</button>
          </div>
        </div>
      ))}
    </section>
  );
};

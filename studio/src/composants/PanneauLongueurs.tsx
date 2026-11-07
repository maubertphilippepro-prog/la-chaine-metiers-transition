import type { FC } from 'react';
import { basculerCoupe, deciderLongueur } from '../../../noyau/edition';
import type { Coupe, Montage, SuggestionLongueur } from '../../../noyau/types';
import { duree, horodatage } from '../logique/format';
import { BoutonsDecision } from './BoutonsDecision';

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
      {longueurs.map((c, index) => (
        <div key={c.id} className="fiche">
          <div>
            <span className="numero">#{index + 1}</span>
            {horodatage(c.debut)} · {duree(c.fin - c.debut)} ·{' '}
            <strong>{c.enAttente ? 'en attente' : c.active ? 'coupé' : 'gardé'}</strong>
          </div>
          <div className="discret">{suggestions.find(s => s.id === c.id)?.raison}</div>
          <div className="actions">
            <BoutonsDecision
              choix={c.enAttente ? null : c.active ? 'oui' : 'non'}
              oui={{ libelle: 'Couper', onClick: () => modifier(m => (c.enAttente ? deciderLongueur(m, c.id, true) : basculerCoupe(m, c.id))) }}
              non={{ libelle: 'Garder', onClick: () => modifier(m => (c.enAttente ? deciderLongueur(m, c.id, false) : basculerCoupe(m, c.id))) }}
            />
            <button onClick={() => ecouter(c.debut, c.fin)}>Écouter</button>
            <button onClick={() => lireDansApercu(c.debut)}>Lire</button>
          </div>
        </div>
      ))}
    </section>
  );
};

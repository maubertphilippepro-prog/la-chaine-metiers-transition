import { type FC, useState } from 'react';
import type { DetailTournage } from '../../commun';
import { api } from '../api';

// Affiché quand l'analyse s'est terminée sans les suggestions de Claude (spec §7).
export const BandeauSuggestions: FC<{ nom: string; erreur: string; onRelance: (d: DetailTournage) => void }> = ({ nom, erreur, onRelance }) => {
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState<string | null>(null);
  const relancer = () => {
    setEnCours(true);
    setEchec(null);
    api.relancerSuggestions(nom)
      .then(onRelance, (e: Error) => setEchec(e.message))
      .finally(() => setEnCours(false));
  };
  return (
    <section className="alerte">
      <div>Suggestions de Claude indisponibles : {erreur}</div>
      <div className="actions">
        <button disabled={enCours} onClick={relancer}>{enCours ? 'Relance en cours…' : 'Relancer les suggestions'}</button>
        {echec && <span>{echec}</span>}
      </div>
    </section>
  );
};

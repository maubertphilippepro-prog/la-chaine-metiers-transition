import type { FC } from 'react';
import { modifierTerme, type ChangementTerme } from '../../../noyau/edition';
import type { Montage, StatutTerme, Terme } from '../../../noyau/types';

interface Props {
  termes: Terme[];
  definitionMax: number;
  modifier: (f: (m: Montage) => Montage) => void;
  ecouter: (debut: number, fin: number) => void;
  lireDansApercu: (t: number) => void;
}

const LIBELLES: Record<StatutTerme, string> = { 'a-valider': 'à valider', valide: 'validé', ecarte: 'écarté' };
const ECOUTE_TERME = 3;

export const PanneauTermes: FC<Props> = ({ termes, definitionMax, modifier, ecouter, lireDansApercu }) => (
  <section className="panneau">
    <h3>Termes ({termes.filter(t => t.statut === 'a-valider').length} à valider)</h3>
    {termes.length === 0 && <p className="discret">Aucun terme proposé.</p>}
    {termes.map(t => {
      const premiere = t.occurrences.length > 0 ? Math.min(...t.occurrences) : null;
      const changer = (changement: ChangementTerme) => modifier(m => modifierTerme(m, t.terme, changement));
      return (
        <div key={t.terme} className="fiche">
          <div>
            <strong>{t.terme}</strong> · <span className={t.statut === 'a-valider' ? 'trop-long' : 'discret'}>{LIBELLES[t.statut]}</span>
            <span className="discret"> · {t.occurrences.length} occurrence(s)</span>
          </div>
          <textarea
            rows={2}
            value={t.definition}
            aria-label={`Définition de ${t.terme}`}
            onChange={e => changer({ definition: e.target.value })}
          />
          <div className={t.definition.length > definitionMax ? 'trop-long' : 'discret'}>
            {t.definition.length} / {definitionMax} caractères
          </div>
          <div className="actions">
            <button disabled={t.statut === 'valide'} onClick={() => changer({ statut: 'valide' })}>Valider</button>
            <button disabled={t.statut === 'ecarte'} onClick={() => changer({ statut: 'ecarte' })}>Écarter</button>
            <label>
              <input
                type="checkbox"
                checked={t.position === 'haut'}
                onChange={e => changer({ position: e.target.checked ? 'haut' : 'bas' })}
              />{' '}
              Encart en haut
            </label>
            {premiere !== null && (
              <>
                <button onClick={() => ecouter(premiere, premiere + ECOUTE_TERME)}>Écouter</button>
                <button onClick={() => lireDansApercu(premiere)}>Lire</button>
              </>
            )}
          </div>
        </div>
      );
    })}
  </section>
);

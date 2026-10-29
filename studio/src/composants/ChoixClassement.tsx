import { type FC, useState } from 'react';
import type { TypeClassement, ValeurClassement } from '../../../noyau/classements';
import { api } from '../api';

interface Props {
  type: TypeClassement;
  choix: number[] | 'aucun' | undefined;
  changer: (choix: number[] | 'aucun' | undefined) => void;
  ajouterValeur: (cle: string, v: ValeurClassement) => void;
}

// Un type de classement du site : valeurs existantes, création d’une valeur, « Aucune sélection » si le type est facultatif.
export const ChoixClassement: FC<Props> = ({ type: t, choix, changer, ajouterValeur }) => {
  const [nouveau, setNouveau] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const choisies = Array.isArray(choix) ? choix : [];
  const connue = (id: number) => t.valeurs.some(v => v.id === id);

  const creer = async () => {
    if (!nouveau?.trim()) return;
    setOccupe(true);
    setErreur(null);
    try {
      const v = await api.creerValeurClassement(t.cle, nouveau);
      ajouterValeur(t.cle, v);
      changer(t.multiple ? [...new Set([...choisies, v.id])] : [v.id]);
      setNouveau(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(false);
    }
  };

  return (
    <fieldset className="classement">
      <legend>{t.libelle}</legend>
      <select
        multiple={t.multiple}
        value={t.multiple ? choisies.map(String) : String(choisies[0] ?? '')}
        onChange={e => {
          const ids = [...e.target.selectedOptions].map(o => Number(o.value)).filter(connue);
          changer(ids.length > 0 ? ids : undefined);
        }}
      >
        {!t.multiple && <option value="">—</option>}
        {t.valeurs.map(v => <option key={v.id} value={v.id}>{v.nom}</option>)}
      </select>
      {nouveau === null
        ? <button type="button" onClick={() => setNouveau('')}>+ Créer…</button>
        : (
          <span>
            <input autoFocus value={nouveau} onChange={e => setNouveau(e.target.value)} placeholder={`Nouvelle valeur « ${t.libelle} »`} />
            <button type="button" disabled={occupe || !nouveau.trim()} onClick={() => void creer()}>Créer</button>
            <button type="button" onClick={() => setNouveau(null)}>Annuler</button>
          </span>
        )}
      {!t.obligatoire && (
        <label>
          <input type="checkbox" checked={choix === 'aucun'} onChange={e => changer(e.target.checked ? 'aucun' : undefined)} />
          {' '}Aucune sélection
        </label>
      )}
      {erreur && <p className="alerte">{erreur}</p>}
    </fieldset>
  );
};

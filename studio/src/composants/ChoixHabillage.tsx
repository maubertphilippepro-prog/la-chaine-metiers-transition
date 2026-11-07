import type { FC } from 'react';
import { HABILLAGE_COMPLET, type Habillage, type Montage } from '../../../noyau/types';

const OPTIONS: { champ: keyof Habillage; libelle: string; aide: string }[] = [
  { champ: 'generique', libelle: 'Générique', aide: 'Titre animé et jingle en début de vidéo' },
  { champ: 'intertitres', libelle: 'Intertitres', aide: 'Titre animé entre les chapitres (vidéo complète)' },
  { champ: 'cartonFin', libelle: 'Carton de fin', aide: 'Logo animé en fin de vidéo' },
];

// Motion design affiché au rendu : chaque élément décoché est retiré de l'aperçu et des rendus.
export const ChoixHabillage: FC<{ montage: Montage; modifier: (f: (m: Montage) => Montage) => void }> = ({ montage, modifier }) => {
  const h = montage.habillage ?? HABILLAGE_COMPLET;
  return (
    <span className="choix-habillage">
      {OPTIONS.map(o => (
        <label key={o.champ} title={o.aide}>
          <input type="checkbox" checked={h[o.champ]}
            onChange={e => { const actif = e.target.checked; modifier(m => ({ ...m, habillage: { ...(m.habillage ?? HABILLAGE_COMPLET), [o.champ]: actif } })); }} />
          {o.libelle}
        </label>
      ))}
    </span>
  );
};

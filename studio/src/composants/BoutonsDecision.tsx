import type { FC } from 'react';

export type Choix = 'oui' | 'non' | null;

interface Option {
  libelle: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}

interface Props {
  choix: Choix;
  oui: Option;
  non: Option;
}

// Paire de boutons de décision : le choix retenu passe en vert, l'alternative en bleu estompé. On peut changer d'avis.
export const BoutonsDecision: FC<Props> = ({ choix, oui, non }) => {
  const classe = (cote: 'oui' | 'non') => (choix === null ? '' : choix === cote ? 'decision-oui' : 'decision-non');
  const bouton = (cote: 'oui' | 'non', o: Option) => (
    <button
      className={classe(cote)}
      aria-pressed={choix === cote}
      disabled={o.disabled}
      title={o.title}
      onClick={() => { if (choix !== cote) o.onClick(); }}
    >
      {o.libelle}
    </button>
  );
  return <>{bouton('oui', oui)}{bouton('non', non)}</>;
};

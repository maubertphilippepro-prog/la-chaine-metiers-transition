import type { FC } from 'react';

// Sablier animé (fixe si l’utilisateur réduit les animations) : une action fait attendre l’auteur.
export const Sablier: FC = () => <span className="sablier" aria-hidden="true">⏳</span>;

// Libellé d’attente précédé du sablier, annoncé aux lecteurs d’écran.
export const Attente: FC<{ libelle: string }> = ({ libelle }) => (
  <span className="attente" role="status"><Sablier />{libelle}</span>
);

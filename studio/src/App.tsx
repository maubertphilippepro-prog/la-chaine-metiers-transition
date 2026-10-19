import { type FC, useEffect, useState } from 'react';
import { EcranMontage } from './composants/EcranMontage';
import { ListeTournages } from './composants/ListeTournages';

// #/ : liste des tournages ; #/<nom> : écran de montage.
const tournageDeLAncre = () => decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));

export const App: FC = () => {
  const [nom, setNom] = useState(tournageDeLAncre);
  useEffect(() => {
    const suivre = () => setNom(tournageDeLAncre());
    window.addEventListener('hashchange', suivre);
    return () => window.removeEventListener('hashchange', suivre);
  }, []);
  return nom ? <EcranMontage key={nom} nom={nom} /> : <ListeTournages />;
};

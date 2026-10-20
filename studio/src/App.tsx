import { type FC, useEffect, useState } from 'react';
import { EcranMontage } from './composants/EcranMontage';
import { EcranPublication } from './composants/EcranPublication';
import { ListeTournages } from './composants/ListeTournages';

// #/ : liste des tournages ; #/<nom> : écran de montage ; #/<nom>/publication : écran de publication.
function routeDeLAncre() {
  const [nom = '', ecran = ''] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { nom: decodeURIComponent(nom), publication: ecran === 'publication' };
}

export const App: FC = () => {
  const [route, setRoute] = useState(routeDeLAncre);
  useEffect(() => {
    const suivre = () => setRoute(routeDeLAncre());
    window.addEventListener('hashchange', suivre);
    return () => window.removeEventListener('hashchange', suivre);
  }, []);
  if (!route.nom) return <ListeTournages />;
  return route.publication ? <EcranPublication key={route.nom} nom={route.nom} /> : <EcranMontage key={route.nom} nom={route.nom} />;
};

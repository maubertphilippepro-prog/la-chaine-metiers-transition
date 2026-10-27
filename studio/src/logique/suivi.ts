export interface Suivi<T> {
  lire: () => T;
  changer: (valeur: T) => void;
  abonner: (ecouteur: () => void) => () => void;
}

// Valeur partagée hors de l'état React, lue par useSyncExternalStore : seuls ses lecteurs se redessinent
// quand elle change (le mot sous l'aperçu change plusieurs fois par seconde pendant la lecture).
export function creerSuivi<T>(initiale: T): Suivi<T> {
  let valeur = initiale;
  const ecouteurs = new Set<() => void>();
  return {
    lire: () => valeur,
    changer: v => {
      if (Object.is(v, valeur)) return;
      valeur = v;
      for (const e of ecouteurs) e();
    },
    abonner: e => {
      ecouteurs.add(e);
      return () => { ecouteurs.delete(e); };
    },
  };
}

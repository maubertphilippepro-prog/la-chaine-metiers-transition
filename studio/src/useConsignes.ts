import { useCallback, useEffect, useRef, useState } from 'react';
import type { Consigne, FichierConsignes } from '../../noyau/consignes';
import { api } from './api';

// Consignes du tournage. Une consigne interprétée est déjà enregistrée par le serveur ;
// chaque acceptation ou refus réenregistre consignes.json, dans l'ordre des décisions.
export function useConsignes(nom: string, initial: FichierConsignes | null) {
  const [fichier, setFichier] = useState<FichierConsignes | null>(initial);
  // Le premier fichier reçu pour ce tournage fait foi ; les suivants (rechargement du détail) sont ignorés.
  const repris = useRef<string | null>(initial ? nom : null);
  const [erreur, setErreur] = useState<string | null>(null);
  const file = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    if (repris.current !== nom) {
      repris.current = null;
      setFichier(null);
      setErreur(null);
    }
    if (repris.current === null && initial) {
      repris.current = nom;
      setFichier(initial);
    }
  }, [nom, initial]);

  const ajouter = useCallback((c: Consigne) => {
    setFichier(f => (f ? { ...f, consignes: [...f.consignes, c] } : f));
  }, []);

  const enregistrer = useCallback((suivant: FichierConsignes) => {
    setFichier(suivant);
    setErreur(null);
    file.current = file.current
      .then(() => api.enregistrerConsignes(nom, suivant))
      .catch((e: unknown) => setErreur(`Échec de l’enregistrement des consignes : ${e instanceof Error ? e.message : String(e)}`));
  }, [nom]);

  return { fichier, erreur, ajouter, enregistrer };
}

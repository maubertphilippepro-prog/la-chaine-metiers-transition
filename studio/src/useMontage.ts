import { useCallback, useEffect, useRef, useState } from 'react';
import { integrerSuggestions } from '../../noyau/montage-initial';
import type { Montage } from '../../noyau/types';
import type { DetailTournage } from '../commun';
import { api } from './api';

export type EtatEnregistrement = 'a-jour' | 'en-attente' | 'erreur';

const DELAI_ENREGISTREMENT = 400;

// Charge un tournage et enregistre montage.json peu après chaque modification, dans l'ordre des modifications.
export function useMontage(nom: string) {
  const [detail, setDetail] = useState<DetailTournage | null>(null);
  const [montage, setMontage] = useState<Montage | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState<EtatEnregistrement>('a-jour');
  const charge = useRef<Montage | null>(null);
  const minuteur = useRef<number | undefined>(undefined);
  const version = useRef(0);
  const file = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    setDetail(null);
    setMontage(null);
    setErreur(null);
    api.tournage(nom).then(
      d => {
        charge.current = d.montage;
        setDetail(d);
        setMontage(d.montage);
      },
      (e: Error) => setErreur(e.message),
    );
  }, [nom]);

  useEffect(() => {
    if (!montage || montage === charge.current) return;
    const v = ++version.current;
    setEnregistrement('en-attente');
    window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => {
      file.current = file.current
        .then(() => api.enregistrer(nom, montage))
        .then(
          () => { if (v === version.current) setEnregistrement('a-jour'); },
          () => setEnregistrement('erreur'),
        );
    }, DELAI_ENREGISTREMENT);
  }, [montage, nom]);

  useEffect(() => {
    if (enregistrement === 'a-jour') return;
    const prevenir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', prevenir);
    return () => window.removeEventListener('beforeunload', prevenir);
  }, [enregistrement]);

  const modifier = useCallback((f: (m: Montage) => Montage) => {
    setMontage(m => (m ? f(m) : m));
  }, []);

  // Après une relance des suggestions : nouvelle analyse, montage complété sans perdre les décisions.
  const remplacerDetail = useCallback((d: DetailTournage) => {
    setDetail(d);
    setMontage(m => (m ? integrerSuggestions(m, d.analyse) : d.montage));
  }, []);

  return { detail, montage, erreur, enregistrement, modifier, remplacerDetail };
}

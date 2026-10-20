import { useCallback, useEffect, useRef, useState } from 'react';
import { appliquerModifications, type Publication } from '../../noyau/publication';
import type { DetailPublication } from '../commun';
import { api } from './api';
import type { EtatEnregistrement } from './useMontage';

const DELAI_ENREGISTREMENT = 400;

// Charge la publication d'un tournage et l'enregistre peu après chaque modification, avec les mêmes règles
// de statut que le serveur. Une action du serveur (rédaction, vignette, validation) part après l'enregistrement
// en attente et remplace la publication par celle qu'il renvoie.
export function usePublication(nom: string) {
  const [detail, setDetail] = useState<DetailPublication | null>(null);
  const [publication, setPublication] = useState<Publication | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState<EtatEnregistrement>('a-jour');
  const recue = useRef<Publication | null>(null);
  const derniere = useRef<Publication | null>(null);
  const minuteur = useRef<number | undefined>(undefined);
  const file = useRef<Promise<unknown>>(Promise.resolve());
  derniere.current = publication;

  const recevoir = useCallback((p: Publication) => {
    recue.current = p;
    setPublication(p);
  }, []);

  useEffect(() => {
    setDetail(null);
    setErreur(null);
    api.publication(nom).then(d => { setDetail(d); recevoir(d.publication); }, (e: Error) => setErreur(e.message));
  }, [nom, recevoir]);

  const enregistrer = useCallback((p: Publication) => {
    file.current = file.current
      .then(() => api.enregistrerPublication(nom, p))
      .then(() => setEnregistrement('a-jour'), () => setEnregistrement('erreur'));
    return file.current;
  }, [nom]);

  useEffect(() => {
    if (!publication || publication === recue.current) return;
    setEnregistrement('en-attente');
    window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => void enregistrer(publication), DELAI_ENREGISTREMENT);
  }, [publication, enregistrer]);

  const modifier = useCallback((f: (p: Publication) => Publication) => {
    setPublication(p => (p ? appliquerModifications(p, f(p)) : p));
  }, []);

  const executer = useCallback(async (action: () => Promise<Publication>) => {
    window.clearTimeout(minuteur.current);
    const p = derniere.current;
    if (p && p !== recue.current) await enregistrer(p);
    recevoir(await action());
    setEnregistrement('a-jour');
  }, [enregistrer, recevoir]);

  return { detail, publication, erreur, enregistrement, modifier, executer };
}

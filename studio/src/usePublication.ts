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
  const enAttente = useRef<Publication | null>(null);
  const file = useRef<Promise<string | null>>(Promise.resolve(null));
  derniere.current = publication;

  const recevoir = useCallback((p: Publication) => {
    // Une modification faite pendant une action longue ne doit pas écraser le résultat de l’action par un enregistrement différé.
    window.clearTimeout(minuteur.current);
    enAttente.current = null;
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
      .then(() => { setEnregistrement('a-jour'); return null; }, (e: Error) => { setEnregistrement('erreur'); return e.message; });
    return file.current;
  }, [nom]);

  // Au démontage (ou au changement de tournage), l'enregistrement en attente part tout de suite au lieu d'être perdu.
  useEffect(() => () => {
    window.clearTimeout(minuteur.current);
    const p = enAttente.current;
    enAttente.current = null;
    if (p) void enregistrer(p);
  }, [enregistrer]);

  useEffect(() => {
    if (!publication || publication === recue.current) return;
    setEnregistrement('en-attente');
    window.clearTimeout(minuteur.current);
    enAttente.current = publication;
    minuteur.current = window.setTimeout(() => {
      enAttente.current = null;
      void enregistrer(publication);
    }, DELAI_ENREGISTREMENT);
  }, [publication, enregistrer]);

  const modifier = useCallback((f: (p: Publication) => Publication) => {
    setPublication(p => (p ? appliquerModifications(p, f(p)) : p));
  }, []);

  // Envoie tout de suite l’enregistrement en attente : une action du serveur doit lire la publication à jour.
  const synchroniser = useCallback(async () => {
    window.clearTimeout(minuteur.current);
    enAttente.current = null;
    const p = derniere.current;
    if (p && p !== recue.current) {
      const echec = await enregistrer(p);
      if (echec !== null) throw new Error(echec);
    }
  }, [enregistrer]);

  const executer = useCallback(async (action: () => Promise<Publication>) => {
    await synchroniser();
    let resultat: Publication;
    try {
      resultat = await action();
    } catch (e) {
      // Une action ratée a pu modifier la publication sur le serveur (retrait du site : qualification Perso enregistrée,
      // erreur notée). On la recharge pour que l’écran et le prochain enregistrement la reprennent, puis l’erreur reste affichée.
      try { recevoir((await api.publication(nom)).publication); } catch { /* l’erreur d’origine prime */ }
      throw e;
    }
    recevoir(resultat);
    setEnregistrement('a-jour');
  }, [synchroniser, recevoir, nom]);

  return { detail, publication, erreur, enregistrement, modifier, executer, synchroniser };
}

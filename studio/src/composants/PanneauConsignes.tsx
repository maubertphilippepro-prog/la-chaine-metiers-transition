import { type FC, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  accepterPropositions, extraitPassage, indicesEnAttente, refuserPropositions, zoneATracer,
  type Ancrage, type Consigne, type EtatProposition, type FichierConsignes, type Operation, type ReglagesConsignes,
} from '../../../noyau/consignes';
import type { Analyse, Montage } from '../../../noyau/types';
import { api } from '../api';
import { bilan, demandeUneZone, passageDeProposition } from '../logique/consignes';
import type { EtatEnregistrement } from '../useMontage';

interface Props {
  nom: string;
  analyse: Analyse;
  montage: Montage;
  reglages: ReglagesConsignes;
  enregistrement: EtatEnregistrement;
  fichier: FichierConsignes;
  erreurEnregistrement: string | null;
  ajouter: (c: Consigne) => void;
  enregistrer: (f: FichierConsignes) => void;
  ancrage: Ancrage | null;
  onAncrage: (a: Ancrage | null) => void;
  modifier: (f: (m: Montage) => Montage) => void;
  ecouter: (debut: number, fin: number) => void;
  lireDansApercu: (t: number) => void;
  // Ouvre le tracé de la zone d'une proposition de zoom ou de mise en avant.
  tracerProposition: (idConsigne: string, indice: number, operation: Operation) => void;
}

const LIBELLES_ETAT: Record<EtatProposition, string> = {
  'en-attente': 'en attente',
  acceptee: 'acceptée',
  refusee: 'refusée',
  invalide: 'invalide',
};
const EXTRAIT_MAX = 60;

const dateCourte = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

// Consigne libre traduite par Claude en propositions : rien ne change tant que l'auteur n'a pas accepté.
export const PanneauConsignes: FC<Props> = props => {
  const { nom, analyse, montage, reglages, enregistrement, fichier, ancrage, onAncrage } = props;
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvertes, setOuvertes] = useState<string[]>([]);
  const zone = useRef<HTMLTextAreaElement>(null);
  const pret = enregistrement === 'a-jour';

  useEffect(() => {
    if (ancrage) zone.current?.focus();
  }, [ancrage]);

  // Le serveur vérifie les propositions sur montage.json : on attend qu'il soit à jour.
  const envoyer = async () => {
    if (!texte.trim() || envoi || !pret) return;
    setEnvoi(true);
    setErreur(null);
    try {
      props.ajouter(await api.donnerConsigne(nom, texte, ancrage));
      setTexte('');
      onAncrage(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvoi(false);
    }
  };

  const touche = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      void envoyer();
    }
  };

  // Pas de décision pendant un envoi : le serveur ajoute la nouvelle consigne au fichier.
  const decider = (consigne: Consigne, indices: number[], accepter: boolean) => {
    const r = accepter
      ? accepterPropositions(analyse, montage, consigne, indices, reglages)
      : { montage, consigne: refuserPropositions(consigne, indices) };
    if (r.montage !== montage) props.modifier(() => r.montage);
    props.enregistrer({ ...fichier, consignes: fichier.consignes.map(c => (c.id === consigne.id ? r.consigne : c)) });
  };

  const detail = (c: Consigne) => {
    const enAttente = indicesEnAttente(c);
    return (
      <div className="consigne">
        <div><strong>{c.texte}</strong></div>
        {c.ancrage && <div className="discret">Sur : « {extraitPassage(analyse, c.ancrage, EXTRAIT_MAX)} »</div>}
        <div className="reformulation">J’ai compris : {c.reformulation}</div>
        {c.nonRealisable.length > 0 && (
          <div className="alerte">
            Pas réalisable :
            <ul>{c.nonRealisable.map(n => <li key={n}>{n}</li>)}</ul>
          </div>
        )}
        {c.propositions.length === 0 && <p className="discret">Aucune opération proposée.</p>}
        {c.propositions.map((p, i) => {
          const passage = p.etat === 'en-attente' ? passageDeProposition(analyse, montage, p.operation) : null;
          return (
            <div key={i} className={p.etat === 'en-attente' ? 'fiche' : 'fiche proposition-traitee'}>
              <div>{p.explication}</div>
              {p.etat === 'en-attente' ? (
                <div className="actions">
                  <button disabled={envoi || zoneATracer(p.operation)} onClick={() => decider(c, [i], true)}>Accepter</button>
                  <button disabled={envoi} onClick={() => decider(c, [i], false)}>Refuser</button>
                  {demandeUneZone(p.operation) && (
                    <button disabled={envoi} onClick={() => props.tracerProposition(c.id, i, p.operation)}>
                      {zoneATracer(p.operation) ? 'Tracer dans l’aperçu' : 'Retracer'}
                    </button>
                  )}
                  {zoneATracer(p.operation) && <span className="trop-long">Zone à tracer</span>}
                  {passage && (
                    <>
                      <button onClick={() => props.ecouter(passage.debut, passage.fin)}>Écouter</button>
                      <button onClick={() => props.lireDansApercu(passage.debut)}>Voir dans l’aperçu</button>
                    </>
                  )}
                </div>
              ) : (
                <div className="discret">{LIBELLES_ETAT[p.etat]}{p.probleme ? ` : ${p.probleme}` : ''}</div>
              )}
            </div>
          );
        })}
        {enAttente.length > 1 && (
          <div className="actions">
            <button disabled={envoi} onClick={() => decider(c, enAttente, true)}>Tout accepter</button>
            <button disabled={envoi} onClick={() => decider(c, enAttente, false)}>Tout refuser</button>
          </div>
        )}
      </div>
    );
  };

  const derniere = fichier.consignes[fichier.consignes.length - 1];
  const precedentes = fichier.consignes.slice(0, -1).reverse();
  return (
    <section className="panneau">
      <h3>Consignes</h3>
      {ancrage && (
        <div className="etiquette">
          Sur : « {extraitPassage(analyse, ancrage, EXTRAIT_MAX)} »{' '}
          <button aria-label="Retirer le passage" onClick={() => onAncrage(null)}>✕</button>
        </div>
      )}
      <textarea
        ref={zone}
        rows={3}
        className="zone-consigne"
        value={texte}
        placeholder="Par exemple : coupe tout le passage sur Excel"
        aria-label="Consigne"
        onChange={e => setTexte(e.target.value)}
        onKeyDown={touche}
      />
      <div className="actions">
        <button className="principal" disabled={envoi || !texte.trim() || !pret} onClick={() => void envoyer()}>
          Envoyer
        </button>
        {envoi && <span className="discret">Claude interprète la consigne…</span>}
        {!envoi && !pret && <span className="discret">En attente de l’enregistrement du montage…</span>}
        {!envoi && pret && <span className="discret">Ctrl+Entrée</span>}
      </div>
      {erreur && <p className="alerte">{erreur}</p>}
      {props.erreurEnregistrement && <p className="alerte">{props.erreurEnregistrement}</p>}
      {derniere && detail(derniere)}
      {precedentes.length > 0 && (
        <details>
          <summary>Consignes précédentes ({precedentes.length})</summary>
          {precedentes.map(c => {
            const ouverte = ouvertes.includes(c.id);
            return (
              <div key={c.id} className="fiche">
                <button
                  className="lien"
                  onClick={() => setOuvertes(o => (ouverte ? o.filter(id => id !== c.id) : [...o, c.id]))}
                >
                  {indicesEnAttente(c).length > 0 && <span className="pastille" title="Propositions en attente" />}
                  {dateCourte(c.date)} · {c.texte} · <span className="discret">{bilan(c)}</span>
                </button>
                {ouverte && detail(c)}
              </div>
            );
          })}
        </details>
      )}
    </section>
  );
};

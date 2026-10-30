import { type FC, useEffect, useState } from 'react';
import type { CiblePublication } from '../../../noyau/publication';
import type { DetailMail } from '../../commun';
import { api } from '../api';
import { Attente } from './Attente';

interface Props {
  nom: string;
  cible: CiblePublication;
}

const COPIE = 'Copie sur SharePoint…';
const REDACTION = 'Rédaction par Claude…';
const CONSTRUCTION = 'Construction et aperçus…';
const RETOUCHE = 'Retouche par Claude…';
const BROUILLON = 'Création du brouillon…';

// Mail de com d'une vidéo Pro : copie SharePoint, rédaction par Claude, relecture, aperçus, brouillon Outlook.
export const PanneauMail: FC<Props> = ({ nom, cible }) => {
  const [d, setD] = useState<DetailMail | null>(null);
  const [texte, setTexte] = useState('');
  const [notes, setNotes] = useState('');
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [consigne, setConsigne] = useState('');
  const [resume, setResume] = useState<string | null>(null);
  // Change à chaque build : force le rechargement des aperçus servis sous le même nom.
  const [version, setVersion] = useState(0);

  const recevoir = (n: DetailMail) => { setD(n); setTexte(n.texte); setNotes(n.notes); };
  useEffect(() => { api.mail(nom, cible).then(recevoir).catch(e => setErreur(e instanceof Error ? e.message : String(e))); }, [nom, cible]);

  const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
  // Enregistrement discret : ne touche ni à `occupe` ni aux textes en cours de saisie.
  const enregistrer = async (action: () => Promise<DetailMail>) => {
    setErreur(null);
    try { setD(await action()); } catch (e) { setErreur(message(e)); }
  };

  const lancer = async (libelle: string, action: () => Promise<DetailMail>) => {
    setOccupe(libelle);
    setErreur(null);
    try {
      const n = await action();
      recevoir(n);
      if (libelle === CONSTRUCTION || libelle === RETOUCHE) setVersion(Date.now());
      if (libelle === CONSTRUCTION) setResume(null);
    } catch (e) {
      setErreur(message(e));
    } finally {
      setOccupe(null);
    }
  };
  if (!d) return erreur ? <p className="alerte">{erreur}</p> : null;

  const e = d.etat;
  const bouton = (libelle: string, quoi: 'copie' | 'redaction' | 'construire' | 'brouillon', texteBouton: string, actif = true) => (
    <div className="actions">
      <button disabled={!!occupe || !actif} onClick={() => void lancer(libelle, () => api.actionMail(nom, cible, quoi))}>{texteBouton}</button>
      {occupe === libelle && <Attente libelle={libelle} />}
    </div>
  );
  const deposer = async (champ: HTMLInputElement) => {
    const fichiers = Array.from(champ.files ?? []);
    champ.value = '';
    if (!fichiers.length) return;
    setEnvoi(true);
    setErreur(null);
    try {
      let dernier: DetailMail | null = null;
      for (const f of fichiers) dernier = await api.deposerImageMail(nom, cible, f.name, f);
      if (dernier) setD(dernier);
    } catch (e) {
      setErreur(message(e));
      // Échec partiel : les images déjà envoyées doivent apparaître ; les textes en cours de saisie restent intacts.
      try { setD(await api.mail(nom, cible)); } catch { /* l'erreur d'envoi reste affichée */ }
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <section className="panneau panneau-mail">
      <h4>Mail de com</h4>
      {bouton(COPIE, 'copie', e.copieLe ? 'Recopier sur SharePoint' : 'Copier sur SharePoint')}
      {e.urlSharepoint && (
        <p className="discret">
          Adresse de la vidéo : <a href={e.urlSharepoint} target="_blank" rel="noreferrer">SharePoint</a>{' '}
          <button className="lien" onClick={() => void navigator.clipboard.writeText(e.urlSharepoint!).then(() => setCopie(true)).catch(e => setErreur(message(e)))}>
            {copie ? 'Copiée' : 'Copier'}
          </button>
        </p>
      )}
      <label>
        Notes pour Claude (ce qu’on attend du lecteur, liens, contexte)
        <textarea rows={3} value={notes} onChange={ev => setNotes(ev.target.value)}
          onBlur={() => notes !== d.notes && void enregistrer(() => api.enregistrerMail(nom, cible, { notes }))} />
      </label>
      <label>
        Images du mail {d.images.length > 0 && <span className="discret">({d.images.join(', ')})</span>}
        <input type="file" accept=".png,.jpg,.jpeg,.gif" multiple disabled={envoi} onChange={ev => void deposer(ev.target)} />
        {envoi && <Attente libelle="Envoi des images…" />}
      </label>
      {bouton(REDACTION, 'redaction', d.texte ? 'Réécrire avec Claude' : 'Rédiger avec Claude', !!e.urlSharepoint)}
      {!e.urlSharepoint && <p className="discret">La rédaction attend la copie sur SharePoint.</p>}
      {(d.texte || texte) && (
        <>
          <label>
            mail.md
            <textarea className="mail-md" rows={18} value={texte} onChange={ev => setTexte(ev.target.value)}
              onBlur={() => texte !== d.texte && void enregistrer(() => api.enregistrerMail(nom, cible, { texte }))} />
          </label>
          {d.aCompleter && <p className="alerte">Le texte contient encore [À COMPLÉTER].</p>}
          {bouton(CONSTRUCTION, 'construire', 'Construire et voir les aperçus', texte === d.texte)}
          {d.apercus.length > 0 && <p className="discret">Construire repart de mail.md : les retouches du rendu sont alors effacées.</p>}
        </>
      )}
      {d.apercus.length > 0 && (
        <>
          <p><a href={`${d.urlBuild}/preview.html`} target="_blank" rel="noreferrer">Ouvrir l’aperçu dans le navigateur</a></p>
          <div className="apercus-mail">
            {d.apercus.map(a => <img key={a} src={`${d.urlBuild}/${a}?v=${version}`} alt={a} title={a} />)}
          </div>
          <label>
            Retouche du rendu, pour ce mail seulement (ex. « titre du bandeau en vert »)
            <textarea rows={2} value={consigne} onChange={ev => setConsigne(ev.target.value)} />
          </label>
          <div className="actions">
            <button disabled={!!occupe || !consigne.trim()} onClick={() => void lancer(RETOUCHE, async () => {
              const n = await api.retoucherMail(nom, cible, consigne);
              setResume(n.resumeRetouche);
              setConsigne('');
              return n;
            })}>Retoucher avec Claude</button>
            {occupe === RETOUCHE && <Attente libelle={RETOUCHE} />}
          </div>
          {resume && <p className="discret">Claude : {resume}</p>}
        </>
      )}
      {bouton(BROUILLON, 'brouillon', 'Créer le brouillon Outlook', d.brouillonPossible)}
      {e.brouillonLe && <p className="discret">Brouillon créé le {new Date(e.brouillonLe).toLocaleString('fr-FR')}. Un nouveau clic en crée un autre ; l’ancien reste dans Brouillons.</p>}
      {erreur && <p className="alerte">{erreur}</p>}
    </section>
  );
};

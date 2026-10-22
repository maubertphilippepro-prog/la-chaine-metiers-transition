import { type FC, useState } from 'react';
import type { Publication, VideoPubliee } from '../../../noyau/publication';
import { visibilitesIndiquees, type VisibiliteYoutube } from '../../../noyau/youtube';
import type { DossierYoutube, VerificationYoutube } from '../../commun';
import { api, ErreurApi } from '../api';
import { isoDepuisLocal, LIBELLES_VISIBILITE, localDepuisIso } from '../logique/publication';
import { Attente } from './Attente';

interface Props {
  nom: string;
  video: VideoPubliee;
  synchroniser: () => Promise<void>;
  executer: (action: () => Promise<Publication>) => Promise<void>;
}

const CHAMPS: [keyof DossierYoutube['textes'], string][] = [['titre', 'le titre'], ['description', 'la description'], ['tags', 'les tags']];

// Téléversement à la main : dossier préparé, champs à copier dans YouTube Studio, puis URL collée et visibilité vérifiée.
const COPIE = 'Copie…';

export const PanneauYoutube: FC<Props> = ({ nom, video: v, synchroniser, executer }) => {
  const [dossier, setDossier] = useState<DossierYoutube | null>(null);
  const [url, setUrl] = useState(v.youtube.id ? `https://youtu.be/${v.youtube.id}` : '');
  const [visibilite, setVisibilite] = useState<VisibiliteYoutube>(v.youtube.visibilite);
  const [date, setDate] = useState(localDepuisIso(v.youtube.programmeeLe));
  const [verification, setVerification] = useState<VerificationYoutube | null>(null);
  const [copie, setCopie] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [problemes, setProblemes] = useState<string[]>([]);

  const permises = visibilitesIndiquees(v);
  const choisie = permises.includes(visibilite) ? visibilite : permises[0]!;

  const lancer = async (libelle: string, action: () => Promise<void>) => {
    setOccupe(libelle);
    setErreur(null);
    setProblemes([]);
    try {
      await action();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      if (e instanceof ErreurApi) setProblemes(e.problemes);
    } finally {
      setOccupe(null);
    }
  };
  const preparer = () => lancer('Préparation du dossier…', async () => {
    await synchroniser();
    setDossier(await api.preparerYoutube(nom, v.cible));
    setCopie(null);
  });
  const verifier = () => lancer('Vérification sur YouTube…', async () => setVerification(await api.verifierYoutube(nom, v.cible)));
  const enregistrerEnvoi = () => lancer('Enregistrement de l’envoi…', async () => {
    const programmeeLe = choisie === 'programmee' ? isoDepuisLocal(date) : null;
    await executer(() => api.envoiYoutube(nom, v.cible, { url, visibilite: choisie, programmeeLe }));
    setVerification(await api.verifierYoutube(nom, v.cible));
  });
  const copier = (libelle: string, texte: string) => lancer(COPIE, async () => {
    await navigator.clipboard.writeText(texte);
    setCopie(libelle);
  });

  return (
    <div className="youtube">
      <h4>YouTube</h4>
      <div className="actions">
        <button disabled={!!occupe} onClick={() => void preparer()}>Préparer pour YouTube</button>
        {dossier && (
          <button disabled={!!occupe} onClick={() => void lancer('Ouverture du dossier…', () => api.ouvrirDossierYoutube(nom, v.cible))}>
            Ouvrir le dossier
          </button>
        )}
      </div>
      {dossier && (
        <>
          <p className="discret">
            Dossier : {dossier.dossier}<br />
            Vidéo à téléverser : {dossier.rendu}
          </p>
          <div className="actions">
            {CHAMPS.map(([cle, libelle]) => (
              <button key={cle} disabled={!!occupe} onClick={() => void copier(libelle, dossier.textes[cle])}>Copier {libelle}</button>
            ))}
            {copie && <span className="discret">Copié : {copie}.</span>}
          </div>
          <pre className="discret">{dossier.textes.reglages}</pre>
        </>
      )}
      <label>
        URL de la vidéo sur YouTube
        <input value={url} placeholder="https://youtu.be/…" onChange={e => setUrl(e.target.value)} />
      </label>
      <div className="actions">
        <label>
          Visibilité choisie{' '}
          <select value={choisie} onChange={e => setVisibilite(e.target.value as VisibiliteYoutube)}>
            {permises.map(p => <option key={p} value={p}>{LIBELLES_VISIBILITE[p]}</option>)}
          </select>
        </label>
        {choisie === 'programmee' && (
          <label>
            Mise en ligne le{' '}
            <input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} />
          </label>
        )}
        <button className="principal" disabled={!!occupe || !url.trim()} onClick={() => void enregistrerEnvoi()}>Enregistrer l’envoi</button>
      </div>
      {v.youtube.id && (
        <div className="actions">
          <a href={`https://youtu.be/${v.youtube.id}`} target="_blank" rel="noreferrer">Voir sur YouTube</a>
          <a href={`https://studio.youtube.com/video/${v.youtube.id}/edit`} target="_blank" rel="noreferrer">Ouvrir dans YouTube Studio</a>
          <button disabled={!!occupe} onClick={() => void verifier()}>Vérifier la visibilité</button>
        </div>
      )}
      {verification && <p className={verification.alerte ? 'alerte' : 'discret'}>{verification.message}</p>}
      {/* Une copie dans le presse-papiers est quasi instantanée : pas de sablier. */}
      {occupe && occupe !== COPIE && <p><Attente libelle={occupe} /></p>}
      {erreur && <p className="alerte">{erreur}</p>}
      {problemes.length > 0 && <ul>{problemes.map(p => <li key={p}>{p}</li>)}</ul>}
    </div>
  );
};

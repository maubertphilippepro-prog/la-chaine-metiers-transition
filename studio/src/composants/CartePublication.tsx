import { type FC, useEffect, useState } from 'react';
import { longueurTags, modifierVideo, retraitAFaire, type Publication, type VideoPubliee, type Vignette } from '../../../noyau/publication';
import type { Gabarit } from '../../../noyau/gabarits';
import { diffusion, NATURES, type Nature, type Qualification } from '../../../noyau/qualification';
import { descriptionYoutube, formatHorodatage } from '../../../noyau/publication-textes';
import { pretePourYoutube, validee } from '../../../noyau/youtube';
import type { DetailPublication, Pose, VideoDisponible } from '../../commun';
import { api, ErreurApi } from '../api';
import {
  CONFIRMATION_RETRAIT, libelleCible, LIBELLES_NATURE, LIBELLES_STATUT, requalificationRetire, resumeDiffusion, tagsDepuisTexte, texteDepuisTags,
} from '../logique/publication';
import { Attente } from './Attente';
import { ChoixVignette } from './ChoixVignette';
import { PanneauSite } from './PanneauSite';
import { PanneauYoutube } from './PanneauYoutube';

interface Props {
  nom: string;
  video: VideoPubliee;
  disponible: VideoDisponible;
  detail: DetailPublication;
  poses: Pose[];
  complete: Vignette | null;
  gabaritsAutres: Gabarit[];
  instant: () => number;
  modifier: (f: (p: Publication) => Publication) => void;
  executer: (action: () => Promise<Publication>) => Promise<void>;
  synchroniser: () => Promise<void>;
}

const REDACTION = 'Rédaction par Claude…';
const VERIFICATION = 'Vérification…';
const RETRAIT = 'Retrait du site…';


export const CartePublication: FC<Props> = ({ nom, video: v, disponible, detail, poses, complete, gabaritsAutres, instant, modifier, executer, synchroniser }) => {
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [problemes, setProblemes] = useState<string[]>([]);
  const [tags, setTags] = useState(texteDepuisTags(v.tags));
  useEffect(() => setTags(texteDepuisTags(v.tags)), [v.tags]);

  const changer = (c: Partial<VideoPubliee>) => modifier(p => modifierVideo(p, v.cible, c));
  const lancer = async (libelle: string, action: () => Promise<Publication>) => {
    setOccupe(libelle);
    setErreur(null);
    setProblemes([]);
    try {
      await executer(action);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      if (e instanceof ErreurApi) setProblemes(e.problemes);
    } finally {
      setOccupe(null);
    }
  };

  // Une vidéo déjà sur le site qui n’y a plus sa place en est retirée, après confirmation, par le serveur
  // (qui enregistre lui-même la nouvelle qualification) ; sinon la qualification change comme un autre champ.
  const requalifier = (q: Qualification) => {
    if (!requalificationRetire(v, q)) {
      changer(q);
      return;
    }
    if (!window.confirm(CONFIRMATION_RETRAIT)) return;
    void lancer(RETRAIT, () => api.retirerDuSite(nom, v.cible, q));
  };
  const d = diffusion(v);

  const r = detail.reglages;
  const descriptionFinale = descriptionYoutube(v.description, disponible.chapitres);
  return (
    <section className="panneau carte-publication">
      <h3>
        <label>
          <input type="checkbox" checked={v.publier} onChange={e => changer({ publier: e.target.checked })} />
          {' '}{libelleCible(v.cible)} — {disponible.titre}
        </label>
        {' '}<span className={`statut statut-${v.statut}`}>{LIBELLES_STATUT[v.statut]}</span>
      </h3>
      {disponible.rendue
        ? <video className="lecteur-publication" src={`${detail.urlTournage}/rendus/${encodeURIComponent(disponible.fichier)}`} controls preload="metadata" />
        : <p className="alerte">Rendu absent : {disponible.fichier}</p>}
      {v.erreur && <p className="alerte">Dernière erreur ({v.erreur.etape}) : {v.erreur.message}</p>}
      {v.publier && (
        <>
          <div className="actions">
            <label>
              Nature{' '}
              <select value={v.nature} disabled={!!occupe} onChange={e => requalifier({ nature: e.target.value as Nature, confidentielle: v.confidentielle })}>
                {NATURES.map(n => <option key={n} value={n}>{LIBELLES_NATURE[n]}</option>)}
              </select>
            </label>
            <label>
              <input
                type="checkbox" checked={v.confidentielle} disabled={!!occupe}
                onChange={e => requalifier({ nature: v.nature, confidentielle: e.target.checked })}
              />
              {' '}Confidentielle
            </label>
            {occupe === RETRAIT && <Attente libelle={RETRAIT} />}
          </div>
          <p className="discret">{resumeDiffusion(d)}</p>
          <div className="actions">
            <button disabled={!!occupe} onClick={() => void lancer(REDACTION, () => api.rediger(nom, v.cible))}>
              Proposer les textes avec Claude
            </button>
            {occupe === REDACTION && <Attente libelle={REDACTION} />}
          </div>
          <label>
            Titre ({v.titre.trim().length}/{r.titreMax})
            <input value={v.titre} onChange={e => changer({ titre: e.target.value })} />
          </label>
          {v.variantesTitre.length > 0 && (
            <div className="actions">
              <span className="discret">Variantes :</span>
              {v.variantesTitre.map(t => <button key={t} className="lien" onClick={() => changer({ titre: t })}>{t}</button>)}
            </div>
          )}
          <label>
            Description ({descriptionFinale.length}/{r.descriptionMax} avec les chapitres)
            <textarea rows={8} value={v.description} onChange={e => changer({ description: e.target.value })} />
          </label>
          {disponible.chapitres.length > 0 && (
            <pre className="discret">Chapitres :{'\n'}{disponible.chapitres.map(c => `${formatHorodatage(c.debut)} ${c.titre}`).join('\n')}</pre>
          )}
          <label>
            Tags, séparés par des virgules ({longueurTags(tagsDepuisTexte(tags))}/{r.tagsMax})
            <input value={tags} onChange={e => setTags(e.target.value)} onBlur={() => changer({ tags: tagsDepuisTexte(tags) })} />
          </label>
          <ChoixVignette nom={nom} video={v} detail={detail} poses={poses} complete={complete} gabaritsAutres={gabaritsAutres} instant={instant} changer={changer} lancer={lancer} occupe={occupe} />
          <div className="actions">
            <button className="principal" disabled={!!occupe} onClick={() => void lancer(VERIFICATION, () => api.validerVideo(nom, v.cible))}>
              Valider pour la publication
            </button>
            {occupe === VERIFICATION && <Attente libelle={VERIFICATION} />}
          </div>
          {pretePourYoutube(v) && (
            <PanneauYoutube key={`youtube-${d.youtube}`} nom={nom} video={v} synchroniser={synchroniser} executer={executer} />
          )}
          {d.youtube === 'aucun' && v.youtube.id && (
            <p className="discret">Cette vidéo a déjà été envoyée sur YouTube : supprimez-la dans YouTube Studio si elle ne doit plus y être.</p>
          )}
          {((validee(v) && d.site !== 'aucun') || retraitAFaire(v)) && (
            <PanneauSite
              key={`site-${d.site}`} nom={nom} video={v} urlSite={detail.urlSite} site={detail.site}
              changer={changer} synchroniser={synchroniser} executer={executer}
            />
          )}
        </>
      )}
      {erreur && <p className="alerte">{erreur}</p>}
      {problemes.length > 0 && <ul>{problemes.map(p => <li key={p}>{p}</li>)}</ul>}
    </section>
  );
};

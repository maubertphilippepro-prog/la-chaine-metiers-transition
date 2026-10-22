import { type FC, useEffect, useState } from 'react';
import { longueurTags, modifierVideo, PROFILS, type Profil, type Publication, type VideoPubliee, type Vignette } from '../../../noyau/publication';
import { descriptionYoutube, formatHorodatage } from '../../../noyau/publication-textes';
import type { DetailPublication, Pose, VideoDisponible } from '../../commun';
import { api, ErreurApi } from '../api';
import { EXPLICATIONS_PROFIL, libelleCible, LIBELLES_PROFIL, LIBELLES_STATUT, tagsDepuisTexte, texteDepuisTags } from '../logique/publication';
import { pretePourYoutube } from '../../../noyau/youtube';
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
  instant: () => number;
  modifier: (f: (p: Publication) => Publication) => void;
  executer: (action: () => Promise<Publication>) => Promise<void>;
  synchroniser: () => Promise<void>;
}


export const CartePublication: FC<Props> = ({ nom, video: v, disponible, detail, poses, complete, instant, modifier, executer, synchroniser }) => {
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
          <label>
            Profil{' '}
            <select value={v.profil} onChange={e => changer({ profil: e.target.value as Profil })}>
              {PROFILS.map(p => <option key={p} value={p}>{LIBELLES_PROFIL[p]}</option>)}
            </select>
          </label>
          <p className="discret">{EXPLICATIONS_PROFIL[v.profil]}</p>
          <button disabled={!!occupe} onClick={() => void lancer('Rédaction par Claude…', () => api.rediger(nom, v.cible))}>
            Proposer les textes avec Claude
          </button>
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
          <ChoixVignette nom={nom} video={v} detail={detail} poses={poses} complete={complete} instant={instant} changer={changer} lancer={lancer} />
          <button className="principal" disabled={!!occupe} onClick={() => void lancer('Vérification…', () => api.validerVideo(nom, v.cible))}>
            Valider pour la publication
          </button>
          {pretePourYoutube(v) && <PanneauYoutube key={`youtube-${v.profil}`}nom={nom} video={v} synchroniser={synchroniser} executer={executer} />}
          {pretePourYoutube(v) && v.profil !== 'perso' && (
            <PanneauSite key={`site-${v.profil}`} nom={nom} video={{ ...v, profil: v.profil }} urlSite={detail.urlSite} site={detail.site} changer={changer} synchroniser={synchroniser} executer={executer} />
          )}
        </>
      )}
      {occupe && <p className="discret">{occupe}</p>}
      {erreur && <p className="alerte">{erreur}</p>}
      {problemes.length > 0 && <ul>{problemes.map(p => <li key={p}>{p}</li>)}</ul>}
    </section>
  );
};

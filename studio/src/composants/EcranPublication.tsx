import { type FC, useEffect, useState } from 'react';
import { diffusion, NATURES, type Nature } from '../../../noyau/qualification';
import type { Pose } from '../../commun';
import { api } from '../api';
import { changerQualificationParDefaut, gabaritsAutres, LIBELLES_NATURE, resumeDiffusion } from '../logique/publication';
import { usePublication } from '../usePublication';
import type { EtatEnregistrement } from '../useMontage';
import { CartePublication } from './CartePublication';
import { Attente } from './Attente';

const LIBELLES_ENREGISTREMENT: Record<EtatEnregistrement, string> = {
  'a-jour': 'Enregistré',
  'en-attente': 'Enregistrement…',
  erreur: 'Échec de l’enregistrement : la prochaine modification réessaiera',
};

// Une carte par vidéo rendue.
export const EcranPublication: FC<{ nom: string }> = ({ nom }) => {
  const { detail, publication, erreur, enregistrement, modifier, executer, synchroniser } = usePublication(nom);
  const [poses, setPoses] = useState<Pose[] | null>(null);
  const [erreurPoses, setErreurPoses] = useState<string | null>(null);
  useEffect(() => {
    api.poses().then(p => { setPoses(p); setErreurPoses(null); }, (e: Error) => setErreurPoses(e.message));
  }, []);

  const retour = <a href={`#/${encodeURIComponent(nom)}`}>← Montage</a>;
  if (erreur) return <div className="page">{retour}<p className="alerte">{erreur}</p></div>;
  if (!detail || !publication) return <div className="page">Chargement…</div>;

  return (
    <div className="page publication">
      <header className="entete">
        {retour}
        <h2>Publication — {detail.titre}</h2>
        {enregistrement === 'en-attente'
          ? <Attente libelle={LIBELLES_ENREGISTREMENT[enregistrement]} />
          : <span className="discret">{LIBELLES_ENREGISTREMENT[enregistrement]}</span>}
      </header>
      <section className="panneau">
        <div className="actions">
          <span>Qualification par défaut :</span>
          <select
            value={publication.qualificationParDefaut.nature}
            onChange={e => modifier(p => changerQualificationParDefaut(p, { ...p.qualificationParDefaut, nature: e.target.value as Nature }))}
          >
            {NATURES.map(n => <option key={n} value={n}>{LIBELLES_NATURE[n]}</option>)}
          </select>
          <label>
            <input
              type="checkbox" checked={publication.qualificationParDefaut.confidentielle}
              onChange={e => modifier(p => changerQualificationParDefaut(p, { ...p.qualificationParDefaut, confidentielle: e.target.checked }))}
            />
            {' '}Confidentielle
          </label>
        </div>
        <p className="discret">
          {resumeDiffusion(diffusion(publication.qualificationParDefaut))}. S’applique aux vidéos qui suivaient la précédente, sauf celles déjà sur le site.
        </p>
        {poses === null && !erreurPoses && <p><Attente libelle="Préparation de la banque de poses…" /></p>}
        {erreurPoses && <p className="alerte">Banque de poses : {erreurPoses}</p>}
        {!detail.site && (
          <p className="discret">Site Replit injoignable ou adresse absente (REPLIT_SITE_URL dans .env) : catégories et playlists indisponibles.</p>
        )}
      </section>
      {publication.videos.map(v => {
        const disponible = detail.videos.find(d => d.cible === v.cible);
        return disponible && (
          <CartePublication
            key={String(v.cible)} nom={nom} video={v} disponible={disponible} detail={detail} poses={poses ?? []}
            complete={publication.videos.find(x => x.cible === 'complete')?.vignette ?? null}
            gabaritsAutres={gabaritsAutres(publication, v.cible)}
            modifier={modifier} executer={executer} synchroniser={synchroniser}
          />
        );
      })}
    </div>
  );
};

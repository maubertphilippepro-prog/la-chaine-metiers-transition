import { Thumbnail } from '@remotion/player';
import { type FC, useState } from 'react';
import { LIBELLES_GABARIT, MAX_ELEMENTS } from '../../../noyau/gabarits';
import { DOSSIER_CAPTURES, proprietesVignette, type BasesImages, type ConsigneVignette, type Publication, type Vignette, type VideoPubliee } from '../../../noyau/publication';
import { HAUTEUR_VIGNETTE, LARGEUR_VIGNETTE, Vignette as CompositionVignette } from '../../../remotion/composants/Vignette';
import type { DetailPublication, Pose } from '../../commun';
import { api } from '../api';
import { appliquerProposition, basculer, formulaireDepuisBase, formulaireInitial, vignetteDepuisProposition, type Formulaire } from '../logique/publication';
import { Attente } from './Attente';

export const GENERATION_VIGNETTE = 'Claude génère 3 vignettes…';

interface Props {
  nom: string;
  video: VideoPubliee;
  detail: DetailPublication;
  poses: Pose[];
  captures: string[];
  complete: Vignette | null;
  bases: BasesImages;
  changer: (c: Partial<VideoPubliee>) => void;
  lancer: (libelle: string, action: () => Promise<Publication>) => Promise<void>;
  occupe: string | null;
}

const apercu = (v: Vignette, bases: BasesImages) => (
  <Thumbnail component={CompositionVignette} compositionWidth={LARGEUR_VIGNETTE} compositionHeight={HAUTEUR_VIGNETTE}
    frameToDisplay={0} durationInFrames={1} fps={30} inputProps={proprietesVignette(v, bases)} style={{ width: '100%' }} />
);

// L'auteur fixe pose, accroche, logos, captures et consignes ; Claude ne génère qu'au clic. Une variante choisie devient
// la base du tour suivant et remplit le formulaire.
export const FormulaireVignette: FC<Props> = ({ nom, video: v, detail, poses, captures, complete, bases, changer, lancer, occupe }) => {
  const [f, setF] = useState<Formulaire>(() => formulaireInitial(v, poses[0]?.fichier, complete));
  const [historique, setHistorique] = useState(false);
  const modifier = (c: Partial<Formulaire>) => setF(a => ({ ...a, ...c }));
  const urlCapture = (fichier: string) => `${detail.urlTournage}/${DOSSIER_CAPTURES}/${encodeURIComponent(fichier)}`;
  const base = f.base && v.consignesVignette[f.base.consigne]?.propositions[f.base.proposition];
  const dernier = v.consignesVignette.at(-1);

  const generer = () => {
    if (occupe || !f.pose || !f.accroche.trim()) return;
    void lancer(GENERATION_VIGNETTE, () => api.genererVignette(nom, v.cible, f));
  };
  // Retenir une variante l'applique à la vignette et en fait la base du prochain tour.
  const retenir = (i: number, j: number) => {
    changer(appliquerProposition(v, i, j));
    setF(formulaireDepuisBase(v, i, j));
  };

  const tour = (c: ConsigneVignette, i: number) => (
    <div key={i} className="consigne">
      {c.texte && <div><strong>{c.texte}</strong></div>}
      {c.compris && <div className="reformulation">J’ai compris : {c.compris}</div>}
      {c.introuvables.length > 0 && <div className="alerte">Logos introuvables dans la banque : {c.introuvables.join(', ')}</div>}
      {c.pasRealisable.length > 0 && <div className="alerte">Pas réalisable :<ul>{c.pasRealisable.map((n, k) => <li key={k}>{n}</li>)}</ul></div>}
      <div className="gabarits">
        {c.propositions.map((p, j) => (
          <button key={j} className={c.choisie === j ? 'gabarit choisi' : 'gabarit'} disabled={!!occupe} onClick={() => retenir(i, j)}>
            {apercu(vignetteDepuisProposition(p, null), bases)}
            <span>{LIBELLES_GABARIT[p.gabarit]}{c.choisie === j ? ' · retenue' : ''} — « {p.accroche} » — {p.explication}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="consignes-vignette">
      <div className="actions">
        <span>Pose :</span>
        {poses.map(p => (
          <button key={p.fichier} className={f.pose === p.fichier ? 'pose choisie' : 'pose'} title={p.fichier} onClick={() => modifier({ pose: p.fichier })}>
            <img src={p.url} alt={p.fichier} />
          </button>
        ))}
      </div>
      <label>
        Accroche (3 à 5 mots)
        <input value={f.accroche} onChange={e => modifier({ accroche: e.target.value })} />
      </label>
      {v.accroches.length > 0 && (
        <div className="actions">
          <span className="discret">Accroches rédigées :</span>
          {v.accroches.map(a => <button key={a} className={a === f.accroche ? 'choisi' : undefined} onClick={() => modifier({ accroche: a })}>{a}</button>)}
        </div>
      )}
      <label>
        Logos (noms séparés par des virgules, cherchés dans la banque)
        <input value={f.logosTexte} placeholder="Excel, Teams, SharePoint" onChange={e => modifier({ logosTexte: e.target.value })} />
      </label>
      <div className="actions">
        <span>Captures ({f.captures.length}/{MAX_ELEMENTS}) :</span>
        {captures.map(c => (
          <button key={c} className={f.captures.includes(c) ? 'pose choisie' : 'pose'} title={c} onClick={() => modifier({ captures: basculer(f.captures, c) })}>
            <img src={urlCapture(c)} alt={c} />
          </button>
        ))}
      </div>
      <label>
        Consignes
        <textarea className="zone-consigne" rows={2} value={f.consignes} placeholder="Zoome sur le bouton Partager, ton plus léger…" onChange={e => modifier({ consignes: e.target.value })} />
      </label>
      {base && (
        <div className="base-vignette">
          <p className="discret">Variante de départ <button onClick={() => modifier({ base: null })}>Repartir de zéro</button></p>
          {apercu(vignetteDepuisProposition(base, null), bases)}
        </div>
      )}
      <div className="actions">
        <button disabled={!!occupe || !f.pose || !f.accroche.trim()} onClick={generer}>Générer 3 vignettes</button>
        {occupe === GENERATION_VIGNETTE && <Attente libelle={GENERATION_VIGNETTE} />}
      </div>
      {dernier && tour(dernier, v.consignesVignette.length - 1)}
      {v.consignesVignette.length > 1 && (
        <details onToggle={e => setHistorique(e.currentTarget.open)}>
          <summary>Tours précédents ({v.consignesVignette.length - 1})</summary>
          {historique && v.consignesVignette.slice(0, -1).map((c, i) => ({ c, i })).reverse().map(({ c, i }) => tour(c, i))}
        </details>
      )}
    </div>
  );
};

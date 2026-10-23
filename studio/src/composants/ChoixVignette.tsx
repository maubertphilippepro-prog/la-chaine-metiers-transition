import { Thumbnail } from '@remotion/player';
import { type FC, useEffect, useState } from 'react';
import { gabaritRetenu, gabaritsCompatibles, LIBELLES_GABARIT, logosSuggeres, MAX_ELEMENTS, type Gabarit } from '../../../noyau/gabarits';
import { cleVignette, DOSSIER_CAPTURES, proprietesVignette, type Publication, type Vignette, type VideoPubliee } from '../../../noyau/publication';
import { HAUTEUR_VIGNETTE, LARGEUR_VIGNETTE, Vignette as CompositionVignette } from '../../../remotion/composants/Vignette';
import type { DetailPublication, Pose } from '../../commun';
import { api } from '../api';
import { basculer, baseVignette } from '../logique/publication';
import { Attente } from './Attente';

export const RENDU_VIGNETTE = 'Rendu de la vignette…';

interface Props {
  nom: string;
  video: VideoPubliee;
  detail: DetailPublication;
  poses: Pose[];
  // Vignette de la vidéo complète : pose et fond de départ des épisodes.
  complete: Vignette | null;
  // Gabarits des autres vidéos de la publication, proposés en dernier.
  gabaritsAutres: Gabarit[];
  // Instant affiché dans le lecteur de l'écran, en secondes de la source.
  instant: () => number;
  changer: (c: Partial<VideoPubliee>) => void;
  lancer: (libelle: string, action: () => Promise<Publication>) => Promise<void>;
  // Libellé de l’action en cours sur la carte, null si aucune.
  occupe: string | null;
}

const arrondi = (t: number) => Math.round(t * 1000) / 1000;

// Pose (banque ou caméra), fond (charte ou écran), accroche ; aperçu immédiat, puis rendu en JPEG par le serveur.
export const ChoixVignette: FC<Props> = ({ nom, video: v, detail, poses, complete, gabaritsAutres, instant, changer, lancer, occupe }) => {
  const [erreur, setErreur] = useState<string | null>(null);
  const [extraction, setExtraction] = useState(false);
  // Repère du dernier rendu : un nouveau rendu de la même vignette (logo ou charte changés) garde le même nom de fichier,
  // le navigateur réafficherait sinon l’ancienne image.
  const [tirage, setTirage] = useState(() => Date.now());
  const [captures, setCaptures] = useState(detail.captures);
  // Suit le détail quand il est rechargé (nouvelle capture vue par le serveur).
  useEffect(() => setCaptures(detail.captures), [detail.captures]);
  const [depot, setDepot] = useState(false);
  const vignette = v.vignette;
  const bases = { tournage: detail.urlTournage, poses: detail.urlPoses, logos: detail.urlLogos };

  const composer = (c: Partial<Omit<Vignette, 'fichier'>>) => {
    const base = baseVignette(vignette, complete, poses[0]?.fichier);
    const pose = c.pose ?? base.pose;
    if (!pose) {
      setErreur('Aucune pose : ajoutez des photos dans donnees/poses/ ou utilisez la caméra séparée.');
      return;
    }
    setErreur(null);
    // Une vignette neuve reçoit les logos des logiciels cités ; le gabarit suit les éléments choisis.
    const logos = c.logos ?? vignette?.logos ?? logosSuggeres(v.logiciels, detail.logos.map(l => l.fichier));
    const choisies = c.captures ?? vignette?.captures ?? [];
    const compatibles = gabaritsCompatibles({ logos: logos.length, captures: choisies.length }, gabaritsAutres);
    changer({
      vignette: {
        pose,
        fond: c.fond ?? base.fond,
        accroche: c.accroche ?? vignette?.accroche ?? v.accroches[0] ?? '',
        gabarit: gabaritRetenu(c.gabarit ?? vignette?.gabarit ?? null, compatibles),
        logos,
        captures: choisies,
        fichier: vignette?.fichier ?? null,
      },
    });
  };

  const deposer = async (fichiers: File[]) => {
    setErreur(null);
    for (const f of fichiers) {
      try {
        setCaptures((await api.deposerCapture(nom, f.name, f)).captures);
      } catch (e) {
        setErreur(`${f.name} : ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }
  };
  const actualiser = async () => {
    try {
      setCaptures(await api.captures(nom));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  };

  const proposes = vignette
    ? gabaritsCompatibles({ logos: vignette.logos.length, captures: vignette.captures.length }, gabaritsAutres)
    : [];
  const urlCapture = (f: string) => `${detail.urlTournage}/${DOSSIER_CAPTURES}/${encodeURIComponent(f)}`;

  const prendre = async (source: 'ecran' | 'camera') => {
    const t = arrondi(instant());
    setExtraction(true);
    setErreur(null);
    try {
      await api.image(nom, source, t);
      composer(source === 'ecran' ? { fond: { source: 'ecran', instant: t } } : { pose: { source: 'camera', instant: t } });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setExtraction(false);
    }
  };

  return (
    <fieldset className="vignette">
      <legend>Vignette</legend>
      <div className="actions">
        <span>Pose :</span>
        {poses.map(p => (
          <button
            key={p.fichier}
            className={vignette?.pose.source === 'banque' && vignette.pose.fichier === p.fichier ? 'pose choisie' : 'pose'}
            title={p.fichier}
            onClick={() => composer({ pose: { source: 'banque', fichier: p.fichier } })}
          >
            <img src={p.url} alt={p.fichier} />
          </button>
        ))}
        {detail.camera && (
          <button disabled={extraction} onClick={() => void prendre('camera')}>Caméra à l’image affichée</button>
        )}
      </div>
      <div className="actions">
        <span>Fond :</span>
        <button onClick={() => composer({ fond: { source: 'charte' } })}>Formes de la charte</button>
        <button disabled={extraction} onClick={() => void prendre('ecran')}>Écran à l’image affichée</button>
      </div>
      <label>
        Accroche (3 à 5 mots)
        <input value={vignette?.accroche ?? ''} onChange={e => composer({ accroche: e.target.value })} />
      </label>
      {v.accroches.length > 0 && (
        <div className="actions">
          <span className="discret">Accroches proposées :</span>
          {v.accroches.map(a => (
            <button key={a} className={a === vignette?.accroche ? 'choisi' : undefined} onClick={() => composer({ accroche: a })}>{a}</button>
          ))}
        </div>
      )}
      <div className="actions">
        <span>Logos ({vignette?.logos.length ?? 0}/{MAX_ELEMENTS}) :</span>
        {detail.logos.length === 0 && <span className="discret">Banque vide : déposez des PNG ou SVG dans donnees/logos/ (nom du fichier = nom du logiciel).</span>}
        {detail.logos.map(l => (
          <button
            key={l.fichier}
            className={vignette?.logos.includes(l.fichier) ? 'pose choisie' : 'pose'}
            title={l.fichier}
            onClick={() => composer({ logos: basculer(vignette?.logos ?? [], l.fichier) })}
          >
            <img src={l.url} alt={l.fichier} />
          </button>
        ))}
      </div>
      <div className="actions">
        <span>Captures ({vignette?.captures.length ?? 0}/{MAX_ELEMENTS}) :</span>
        {captures.map(f => (
          <button
            key={f}
            className={vignette?.captures.includes(f) ? 'pose choisie' : 'pose'}
            title={f}
            onClick={() => composer({ captures: basculer(vignette?.captures ?? [], f) })}
          >
            <img src={urlCapture(f)} alt={f} />
          </button>
        ))}
        <button onClick={() => void actualiser()}>Actualiser</button>
      </div>
      <div
        className={depot ? 'depot actif' : 'depot'}
        onDragOver={e => { e.preventDefault(); setDepot(true); }}
        onDragLeave={() => setDepot(false)}
        onDrop={e => { e.preventDefault(); setDepot(false); void deposer([...e.dataTransfer.files]); }}
      >
        Glissez ici des captures (PNG ou JPEG), ou déposez-les dans captures/ du tournage puis « Actualiser ».
      </div>
      {vignette && (
        <>
          <p className="discret">Gabarit : cliquez sur un aperçu.</p>
          <div className="gabarits">
            {proposes.map(g => (
              <button key={g} className={g === vignette.gabarit ? 'gabarit choisi' : 'gabarit'} onClick={() => composer({ gabarit: g })}>
                <Thumbnail
                  component={CompositionVignette}
                  compositionWidth={LARGEUR_VIGNETTE}
                  compositionHeight={HAUTEUR_VIGNETTE}
                  frameToDisplay={0}
                  durationInFrames={1}
                  fps={30}
                  inputProps={proprietesVignette({ ...vignette, gabarit: g }, bases)}
                  style={{ width: '100%' }}
                />
                <span>{LIBELLES_GABARIT[g]}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {extraction && <p><Attente libelle="Extraction de l’image…" /></p>}
      {erreur && <p className="alerte">{erreur}</p>}
      {vignette && (
        <div className="apercus-vignette">
          <div>
            <p className="discret">Aperçu</p>
            <Thumbnail
              component={CompositionVignette}
              compositionWidth={LARGEUR_VIGNETTE}
              compositionHeight={HAUTEUR_VIGNETTE}
              frameToDisplay={0}
              durationInFrames={1}
              fps={30}
              inputProps={proprietesVignette(vignette, bases)}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <p className="discret">Rendu</p>
            {occupe === RENDU_VIGNETTE
              ? <div className="rendu-en-cours"><Attente libelle={RENDU_VIGNETTE} /></div>
              : vignette.fichier
                ? <img className="vignette-rendue" src={`${detail.urlTournage}/${vignette.fichier}?v=${encodeURIComponent(cleVignette(vignette))}&t=${tirage}`} alt="Vignette rendue" />
                : <p className="discret">Pas encore rendue.</p>}
          </div>
        </div>
      )}
      {vignette && (
        <>
          <div className="actions">
            <button disabled={!!occupe} onClick={() => void lancer(RENDU_VIGNETTE, async () => {
              const p = await api.rendreVignette(nom, v.cible);
              setTirage(Date.now());
              return p;
            })}>Rendre la vignette</button>
            {occupe === RENDU_VIGNETTE && <Attente libelle={RENDU_VIGNETTE} />}
          </div>
          <p className="discret">
            L’aperçu est calculé par le navigateur ; le rendu fabrique le fichier JPEG 1280×720 qui sera téléversé sur YouTube.
            À refaire après chaque changement de pose, de fond, d’accroche, de logos, de captures ou de gabarit, avant de valider.
          </p>
        </>
      )}
    </fieldset>
  );
};

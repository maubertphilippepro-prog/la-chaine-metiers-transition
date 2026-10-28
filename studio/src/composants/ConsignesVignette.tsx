import { Thumbnail } from '@remotion/player';
import { type FC, type KeyboardEvent, useState } from 'react';
import { LIBELLES_GABARIT } from '../../../noyau/gabarits';
import { proprietesVignette, type BasesImages, type ConsigneVignette, type Publication, type VideoPubliee } from '../../../noyau/publication';
import { HAUTEUR_VIGNETTE, LARGEUR_VIGNETTE, Vignette as CompositionVignette } from '../../../remotion/composants/Vignette';
import { api } from '../api';
import { appliquerProposition, vignetteDepuisProposition } from '../logique/publication';
import { Attente } from './Attente';

export const CONSIGNE_VIGNETTE = 'Claude compose la vignette…';

interface Props {
  nom: string;
  video: VideoPubliee;
  bases: BasesImages;
  changer: (c: Partial<VideoPubliee>) => void;
  lancer: (libelle: string, action: () => Promise<Publication>) => Promise<void>;
  // Libellé de l’action en cours sur la carte, null si aucune.
  occupe: string | null;
}

// Consigne libre pour la vignette : Claude répond par 2 ou 3 compositions en aperçu, un clic en applique une.
export const ConsignesVignette: FC<Props> = ({ nom, video: v, bases, changer, lancer, occupe }) => {
  const [texte, setTexte] = useState('');
  const [historique, setHistorique] = useState(false);

  const envoyer = () => {
    if (!texte.trim() || occupe) return;
    const envoye = texte;
    void lancer(CONSIGNE_VIGNETTE, async () => {
      const p = await api.consigneVignette(nom, v.cible, envoye);
      // Ce que l’auteur a tapé pendant l’appel n’est pas effacé.
      setTexte(t => (t === envoye ? '' : t));
      return p;
    });
  };
  const touche = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      envoyer();
    }
  };

  const carte = (c: ConsigneVignette, i: number) => (
    <div key={i} className="consigne">
      <div><strong>{c.texte}</strong></div>
      <div className="reformulation">J’ai compris : {c.compris}</div>
      {c.pasRealisable.length > 0 && (
        <div className="alerte">
          Pas réalisable :
          <ul>{c.pasRealisable.map((n, k) => <li key={k}>{n}</li>)}</ul>
        </div>
      )}
      <div className="gabarits">
        {c.propositions.map((p, j) => (
          <button key={j} className={c.choisie === j ? 'gabarit choisi' : 'gabarit'} disabled={!!occupe} onClick={() => changer(appliquerProposition(v, i, j))}>
            <Thumbnail
              component={CompositionVignette}
              compositionWidth={LARGEUR_VIGNETTE}
              compositionHeight={HAUTEUR_VIGNETTE}
              frameToDisplay={0}
              durationInFrames={1}
              fps={30}
              inputProps={proprietesVignette(vignetteDepuisProposition(p, null), bases)}
              style={{ width: '100%' }}
            />
            <span>{LIBELLES_GABARIT[p.gabarit]}{c.choisie === j ? ' · retenue' : ''} — {p.explication}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const n = v.consignesVignette.length;
  return (
    <div className="consignes-vignette">
      <label>
        Consigne pour la vignette
        <textarea
          className="zone-consigne" rows={2} value={texte} placeholder="Mets en avant le planning, ton plus léger…"
          onChange={e => setTexte(e.target.value)} onKeyDown={touche}
        />
      </label>
      <div className="actions">
        <button disabled={!!occupe || !texte.trim()} onClick={envoyer}>Envoyer</button>
        {occupe === CONSIGNE_VIGNETTE ? <Attente libelle={CONSIGNE_VIGNETTE} /> : <span className="discret">Ctrl+Entrée</span>}
      </div>
      {n > 0 && carte(v.consignesVignette[n - 1]!, n - 1)}
      {n > 1 && (
        <details onToggle={e => setHistorique(e.currentTarget.open)}>
          <summary>Consignes précédentes ({n - 1})</summary>
          {historique && v.consignesVignette.slice(0, -1).map((c, i) => ({ c, i })).reverse().map(({ c, i }) => carte(c, i))}
        </details>
      )}
    </div>
  );
};

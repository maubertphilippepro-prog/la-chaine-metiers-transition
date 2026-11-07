import { type FC, useEffect, useState } from 'react';
import { lignePresentation, motsTitre, PRESENTATION_VIDE, textePresentation, TITRE_MOTS_MAX, type Presentation } from '../../../noyau/presentation';
import type { CiblePublication } from '../../../noyau/publication';
import type { DetailPresentation } from '../../commun';
import { api } from '../api';
import { Attente } from './Attente';

interface Props {
  nom: string;
  cible: CiblePublication;
}

const REDACTION = 'Rédaction par Claude…';
const memes = (a: Presentation, b: Presentation) => JSON.stringify(a) === JSON.stringify(b);

// Texte de présentation pour la page SharePoint « Chaîne M&T » : accroche, tags, description, rédigés par Claude puis relus.
export const PanneauPresentation: FC<Props> = ({ nom, cible }) => {
  const [d, setD] = useState<DetailPresentation | null>(null);
  const [p, setP] = useState<Presentation>(PRESENTATION_VIDE);
  const [tags, setTags] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const recevoir = (n: DetailPresentation) => { setD(n); setP(n.presentation); setTags(n.presentation.tags.join(' • ')); };
  useEffect(() => { api.presentation(nom, cible).then(recevoir).catch(e => setErreur(message(e))); }, [nom, cible]);

  const enregistrer = async (nouvelle: Presentation) => {
    if (d && memes(nouvelle, d.presentation)) return;
    setErreur(null);
    try { setD(await api.enregistrerPresentation(nom, cible, nouvelle)); } catch (e) { setErreur(message(e)); }
  };
  const rediger = async () => {
    setOccupe(true);
    setErreur(null);
    try { recevoir(await api.redigerPresentation(nom, cible)); } catch (e) { setErreur(message(e)); } finally { setOccupe(false); }
  };
  if (!d) return erreur ? <p className="alerte">{erreur}</p> : null;

  const lireTags = (texte: string) => texte.split('•').map(t => t.trim()).filter(Boolean);
  const mots = motsTitre(p.titre);
  return (
    <section className="panneau panneau-presentation">
      <h4>Présentation SharePoint (Chaîne M&amp;T)</h4>
      <div className="actions">
        <button disabled={occupe} onClick={() => void rediger()}>{d.redigee ? 'Rédiger à nouveau avec Claude' : 'Rédiger avec Claude'}</button>
        {occupe && <Attente libelle={REDACTION} />}
      </div>
      {d.redigee && (
        <>
          <label>
            Titre / accroche ({mots} / {TITRE_MOTS_MAX} mots)
            <input value={p.titre} onChange={e => setP({ ...p, titre: e.target.value })} onBlur={() => void enregistrer(p)} />
          </label>
          {mots > TITRE_MOTS_MAX && <p className="trop-long">Plus de {TITRE_MOTS_MAX} mots.</p>}
          <label>
            Tags (séparés par « • » ; la durée et « 1 vidéo » sont ajoutés)
            <input value={tags} onChange={e => setTags(e.target.value)}
              onBlur={() => { const n = { ...p, tags: lireTags(tags) }; setP(n); void enregistrer(n); }} />
          </label>
          <p className="discret">{lignePresentation({ ...p, tags: lireTags(tags) }, d.dureeSecondes)}</p>
          <label>
            Description
            <textarea rows={10} value={p.description} onChange={e => setP({ ...p, description: e.target.value })} onBlur={() => void enregistrer(p)} />
          </label>
          <button className="lien" onClick={() => void navigator.clipboard.writeText(textePresentation({ ...p, tags: lireTags(tags) }, d.dureeSecondes))
            .then(() => setCopie(true)).catch(e => setErreur(message(e)))}>
            {copie ? 'Copié' : 'Copier la présentation'}
          </button>
        </>
      )}
      {erreur && <p className="alerte">{erreur}</p>}
    </section>
  );
};

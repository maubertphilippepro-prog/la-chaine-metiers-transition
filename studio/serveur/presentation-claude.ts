import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { TITRE_MOTS_MAX, type Presentation } from '../../noyau/presentation';
import { traduireErreurClaude, verifierCleClaude } from './claude';
import { ErreurInterpretation } from './consignes';

export interface DemandePresentation {
  titreVideo: string;
  description: string;
  // Paroles conservées dans la vidéo montée.
  texte: string;
  chapitres: string[];
  modele: string;
}

export type RedigerPresentation = (d: DemandePresentation) => Promise<Presentation>;

const SchemaPresentation = z.object({ titre: z.string(), tags: z.array(z.string()), description: z.string() });

// Exemple réel de la page SharePoint, donné comme gabarit de ton et de longueur.
const EXEMPLE = `Titre : Produire un livrable technique fiable en moins d'1h ?
Tags : Mindra (powered by There.do)
Description :
Cette vidéo présente Mindra, un outil de génération de livrables techniques, à travers ses deux fonctionnalités principales :

1- La bibliothèque d'extraits permet de stocker des blocs prêts à l'emploi (texte, encadrés, tableaux), déclinés en plusieurs variantes et partageables avec soi-même, une équipe ou toute l'organisation.

2- Les routines sont de petits agents spécialisés qui agissent sur un document : par exemple, vérifier la cohérence d'une note d'organisation de chantier (NOC) par rapport au gabarit qualité, proposer des commentaires puis des corrections à accepter ou refuser.`;

export function construirePromptPresentation(d: DemandePresentation): string {
  const chapitres = d.chapitres.length > 0 ? `\nChapitres :\n${d.chapitres.map(c => `- ${c}`).join('\n')}\n` : '';
  return `Tu rédiges le texte de présentation d'une vidéo interne publiée sur la page SharePoint « Chaîne Métiers & Transition ». Les lecteurs sont des collègues ingénieurs qui décident s'ils regardent la vidéo.

Vidéo : ${d.titreVideo}
Description déjà rédigée : ${d.description || '(aucune)'}
${chapitres}
<transcription>
${d.texte}
</transcription>

Produis trois éléments, sur le modèle de cet exemple réel :

<exemple>
${EXEMPLE}
</exemple>

- « titre » : une accroche de ${TITRE_MOTS_MAX} mots maximum, souvent une question qui pose le bénéfice concret pour le lecteur.
- « tags » : 1 à 3 tags courts nommant l'outil, le produit ou le thème (avec l'éditeur entre parenthèses si la vidéo le cite). Ni durée ni nombre de vidéos : ils sont ajoutés automatiquement.
- « description » : longueur proche de l'exemple (80 à 130 mots). Une phrase d'introduction qui dit ce que la vidéo présente, puis les points clés numérotés « 1- », « 2- »… séparés par une ligne vide, chacun concret (avec un exemple tiré de la vidéo si possible).

N'invente aucun fait, chiffre ou nom absent de la transcription. Texte brut, sans Markdown.
`;
}

export async function redigerPresentation(d: DemandePresentation, client?: Anthropic): Promise<Presentation> {
  verifierCleClaude(client);
  let r;
  try {
    r = await (client ?? new Anthropic()).messages.parse(
      {
        model: d.modele,
        max_tokens: 4000,
        output_config: { effort: 'medium', format: zodOutputFormat(SchemaPresentation) },
        messages: [{ role: 'user', content: construirePromptPresentation(d) }],
        fallbacks: 'default',
      },
      { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } },
    );
  } catch (e) {
    throw traduireErreurClaude(e);
  }
  if (r.stop_reason === 'refusal') throw new ErreurInterpretation(500, 'Claude a refusé de rédiger cette présentation.');
  const p = r.parsed_output;
  if (!p?.titre.trim() || !p.description.trim()) throw new ErreurInterpretation(500, `Réponse de Claude inexploitable (arrêt : ${r.stop_reason}).`);
  return { titre: p.titre.trim(), tags: p.tags.map(t => t.trim()).filter(Boolean), description: p.description.trim() };
}

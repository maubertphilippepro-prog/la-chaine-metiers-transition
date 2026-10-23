import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { diffusion, type Qualification } from '../../noyau/qualification';
import { traduireErreurClaude, verifierCleClaude } from './claude';
import { ErreurInterpretation } from './consignes';

// Ce qu’il faut à Claude pour proposer les textes de publication d’une vidéo.
export interface DemandeRedaction {
  titreVideo: string;
  // Paroles conservées dans la vidéo montée.
  texte: string;
  // Titres des chapitres (vidéo complète seulement).
  chapitres: string[];
  termes: { terme: string; definition: string }[];
  qualification: Qualification;
  modele: string;
}

export interface PropositionRedaction {
  titre: string;
  variantesTitre: string[];
  description: string;
  tags: string[];
  accroches: string[];
  logiciels: string[];
}

export type Rediger = (d: DemandeRedaction) => Promise<PropositionRedaction>;

export function construirePromptRedaction(d: DemandeRedaction): string {
  const chapitres = d.chapitres.length > 0 ? `\nChapitres de la vidéo :\n${d.chapitres.map(c => `- ${c}`).join('\n')}\n` : '';
  const termes = d.termes.length > 0 ? `\nTermes définis à l’écran :\n${d.termes.map(t => `- ${t.terme} : ${t.definition}`).join('\n')}\n` : '';
  const ton = diffusion(d.qualification).youtube === 'aucun'
    ? 'Cette vidéo est destinée à un usage interne : ton sobre et professionnel.'
    : 'Cette vidéo part sur YouTube : ne mentionne aucun employeur, client ni organisation, même si la transcription en cite.';
  return `Tu aides l’auteur de la chaîne YouTube « PMT » (astuces et outils numériques expliqués simplement à un public non spécialiste) à publier une vidéo tournée face caméra, en français. À partir de ce qu’il dit, propose les textes de publication ; il les relira et les corrigera.

Titre de travail : ${d.titreVideo}
${chapitres}${termes}
<transcription>
${d.texte}
</transcription>

${ton}

Réponds avec :
- titre : un titre YouTube accrocheur et honnête, 70 caractères au plus, qui dit ce que le spectateur va apprendre ; majuscule au premier mot seulement, pas d’émoji, pas de points d’exclamation en série.
- variantesTitre : deux autres titres, d’un angle différent, mêmes règles.
- description : 2 à 4 courts paragraphes (une accroche d’une phrase, ce que montre la vidéo, à qui elle sert), puis, s’il en cite, les outils ou sites nommés dans la vidéo, un par ligne. Pas d’horodatage ni de liste de chapitres : ils sont ajoutés automatiquement. N’invente aucun lien : ne donne une adresse que si elle est prononcée.
- tags : 8 à 15 mots-clés de recherche, en minuscules, du plus précis au plus général (noms d’outils, tâches, notions).
- accroches : trois textes de 3 à 5 mots pour la vignette, percutants et lisibles en petit, sans reprendre le titre mot pour mot.
- logiciels : les logiciels, applications et services en ligne nommés dans la vidéo, chacun sous son nom usuel (« Excel », « ChatGPT », « Microsoft Teams »), du plus présent au moins présent ; liste vide s’il n’y en a pas.
`;
}

const SchemaRedaction = z.object({
  titre: z.string(),
  variantesTitre: z.array(z.string()),
  description: z.string(),
  tags: z.array(z.string()),
  accroches: z.array(z.string()),
  logiciels: z.array(z.string()),
});

const nonVides = (textes: string[]) => textes.map(t => t.trim()).filter(t => t !== '');

// Sans blancs ni doublons (à la casse près), dans l'ordre d'origine.
function uniques(textes: string[]): string[] {
  const vus = new Set<string>();
  return nonVides(textes).filter(t => {
    const cle = t.toLowerCase();
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });
}

export function nettoyerProposition(p: PropositionRedaction): PropositionRedaction {
  return {
    titre: p.titre.trim(),
    variantesTitre: nonVides(p.variantesTitre).slice(0, 2),
    description: p.description.trim(),
    tags: uniques(p.tags),
    accroches: nonVides(p.accroches).slice(0, 3),
    logiciels: uniques(p.logiciels).slice(0, 10),
  };
}

// Sortie structurée, effort moyen et repli serveur en cas de refus, comme l’interprétation des consignes.
export async function redigerPublication(d: DemandeRedaction, client?: Anthropic): Promise<PropositionRedaction> {
  verifierCleClaude(client);
  let reponse;
  try {
    reponse = await (client ?? new Anthropic()).messages.parse(
      {
        model: d.modele,
        max_tokens: 8000,
        output_config: { effort: 'medium', format: zodOutputFormat(SchemaRedaction) },
        messages: [{ role: 'user', content: construirePromptRedaction(d) }],
        fallbacks: 'default',
      },
      { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } },
    );
  } catch (e) {
    throw traduireErreurClaude(e);
  }
  if (reponse.stop_reason === 'refusal') throw new ErreurInterpretation(500, 'Claude a refusé de rédiger les textes de cette vidéo.');
  if (!reponse.parsed_output) throw new ErreurInterpretation(500, `Réponse de Claude inexploitable (arrêt : ${reponse.stop_reason}).`);
  return nettoyerProposition(reponse.parsed_output);
}

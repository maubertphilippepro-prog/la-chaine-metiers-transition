import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { BriefLinkedin, ProfilLinkedin } from '../../noyau/linkedin';
import { traduireErreurClaude, verifierCleClaude } from './claude';
import { ErreurInterpretation } from './consignes';

// Bibliothèque du skill post-linkedin (outils/linkedin/assets) : guide, index, posts réels du profil.
export interface Bibliotheque {
  guide: string;
  index: string;
  exemples: { fichier: string; texte: string }[];
}

export interface DemandePost {
  profil: ProfilLinkedin;
  titreVideo: string;
  description: string;
  // Paroles conservées dans la vidéo montée.
  texte: string;
  chapitres: string[];
  brief: BriefLinkedin;
  bibliotheque: Bibliotheque;
  modele: string;
}

export interface Post {
  post: string;
  inspirations: string[];
}

export type RedigerPost = (d: DemandePost) => Promise<Post>;

const SchemaPost = z.object({ post: z.string(), inspirations: z.array(z.string()) });

const VOIX: Record<ProfilLinkedin, string> = {
  personnel: 'le profil personnel de Philippe : il écrit en « je », ton chaleureux, apartés humoristiques entre parenthèses, récit vécu, emojis placés en ponctuation',
  cicad: 'le compte CICAD : l’organisation parle en « nous », jamais « je », ton institutionnel, structuré et factuel, qui valorise le pôle Métiers & Transition et ses partenaires ; Philippe y est cité à la 3e personne s’il est mentionné',
};

const reponse = (v: string) => v.trim() || '(non précisé)';

export function construirePromptPost(d: DemandePost): string {
  const chapitres = d.chapitres.length > 0 ? `\nChapitres :\n${d.chapitres.map(c => `- ${c}`).join('\n')}\n` : '';
  const exemples = d.bibliotheque.exemples.map(e => `<post fichier="${e.fichier}">\n${e.texte.trim()}\n</post>`).join('\n\n');
  return `Tu rédiges un post LinkedIn pour ${VOIX[d.profil]}. Le post doit ressembler à ce que Philippe aurait écrit lui-même, jamais à du copywriting LinkedIn générique : sa bibliothèque de posts réels ci-dessous fait référence. Le post annonce ou prolonge une vidéo du pôle, dont voici le contenu.

Vidéo : ${d.titreVideo}
Description publiée : ${d.description || '(aucune)'}
${chapitres}
<transcription>
${d.texte}
</transcription>

<brief>
Objectif : ${reponse(d.brief.objectif)}
Call-to-action : ${reponse(d.brief.cta)}
Éléments concrets (chiffres, outils, opérations, personnes à mentionner ou remercier, anecdote) : ${reponse(d.brief.elements)}
Visuel : ${reponse(d.brief.visuel)}
</brief>

Démarche :
1. Lis le guide de style pour ce profil, puis choisis dans la bibliothèque 2 à 3 posts de ce profil dont le cas est le plus proche de la demande, complétés par un d’un autre cas. Relève l’ouverture, le découpage, la place des emojis, les listes, la conclusion, les hashtags, la longueur. Les posts marqués « statut: brouillon » comptent un peu moins.
2. Rédige en respectant ce style et la plage de longueur habituelle du profil et du cas. Intègre l’objectif, le CTA et les éléments du brief ; le style réel contient rarement un CTA.
3. N’invente aucun fait, chiffre, nom ou citation absent de la transcription ou du brief. Un nom ou intitulé incertain va entre [crochets], comme dans les brouillons de Philippe.
4. Si le brief ne prévoit pas de visuel, ajoute en dernière ligne, séparée par une ligne vide, une suggestion de visuel en une phrase commençant par « Visuel suggéré : ».

À éviter : mélanger les profils, les tics LinkedIn (listes de « leçons », accroches racoleuses, emojis en rafale, « Et vous ? » systématique, hashtags en milieu de texte), recopier un exemple en changeant seulement le sujet.

<guide_de_style>
${d.bibliotheque.guide}
</guide_de_style>

<index>
${d.bibliotheque.index}
</index>

<bibliotheque>
${exemples}
</bibliotheque>

Réponds par « post » : le texte brut prêt à coller dans LinkedIn (vrais retours à la ligne, hashtags en fin de post, aucune mise en forme Markdown), et « inspirations » : les fichiers des exemples dont tu t’es inspiré.
`;
}

export async function redigerPost(d: DemandePost, client?: Anthropic): Promise<Post> {
  verifierCleClaude(client);
  let r;
  try {
    r = await (client ?? new Anthropic()).messages.parse(
      {
        model: d.modele,
        max_tokens: 8000,
        output_config: { effort: 'medium', format: zodOutputFormat(SchemaPost) },
        messages: [{ role: 'user', content: construirePromptPost(d) }],
        fallbacks: 'default',
      },
      { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } },
    );
  } catch (e) {
    throw traduireErreurClaude(e);
  }
  if (r.stop_reason === 'refusal') throw new ErreurInterpretation(500, 'Claude a refusé de rédiger ce post.');
  if (!r.parsed_output?.post.trim()) throw new ErreurInterpretation(500, `Réponse de Claude inexploitable (arrêt : ${r.stop_reason}).`);
  return { post: `${r.parsed_output.post.trim()}\n`, inspirations: r.parsed_output.inspirations };
}

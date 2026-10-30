import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { A_COMPLETER, type Remplacement } from '../../noyau/mail';
import { traduireErreurClaude, verifierCleClaude } from './claude';
import { ErreurInterpretation } from './consignes';

// Ce qu'il faut à Claude pour écrire le mail de com d'une vidéo Pro, au format mail.md du skill de mailing.
export interface DemandeMail {
  titreVideo: string;
  description: string;
  // Paroles conservées dans la vidéo montée.
  texte: string;
  chapitres: string[];
  notes: string;
  // Images déposées dans assets/ du mail, et vignette rendue copiée à côté (null si absente).
  images: string[];
  vignette: string | null;
  urlVideo: string;
  logosBandeau: string[];
  // references/redaction.md, references/syntaxe.md et examples/exemple-fico-there.md du skill.
  charte: string;
  syntaxe: string;
  exemple: string;
  modele: string;
}

export type RedigerMail = (d: DemandeMail) => Promise<string>;

export function construirePromptMail(d: DemandeMail): string {
  const video = d.vignette ? `[[video: ${d.titreVideo} | ${d.urlVideo} | ${d.vignette}]]` : `[[video: ${d.titreVideo} | ${d.urlVideo}]]`;
  const chapitres = d.chapitres.length > 0 ? `\nChapitres :\n${d.chapitres.map(c => `- ${c}`).join('\n')}\n` : '';
  const images = d.images.length > 0 ? d.images.join(', ') : 'aucune';
  return `Tu rédiges, pour le Pôle Métiers & Transition, le mail de com interne qui annonce une vidéo aux collaborateurs CICAD. Le mail s'écrit dans le format mail.md décrit plus bas ; l'auteur le relira avant envoi.

Vidéo : ${d.titreVideo}
Description publiée : ${d.description || '(aucune)'}
${chapitres}
<transcription>
${d.texte}
</transcription>

<notes_de_l_auteur>
${d.notes || '(aucune)'}
</notes_de_l_auteur>

Images disponibles (à citer par leur nom seul) : ${images}
Logos produit possibles pour bandeau_logo : ${d.logosBandeau.join(', ') || 'aucun'} (n'en mets pas d'autre).

Règles :
- Le mail renvoie vers la vidéo par ce bloc, à reprendre tel quel : ${video}
- N'invente ni date, ni lien, ni nom : si une info utile manque, écris ${A_COMPLETER} à sa place.
- Suis la charte et la syntaxe ci-dessous ; l'exemple montre un mail validé.

<charte>
${d.charte}
</charte>

<syntaxe>
${d.syntaxe}
</syntaxe>

<exemple>
${d.exemple}
</exemple>

Réponds uniquement par le contenu complet de mail.md, en-tête compris, sans commentaire.
`;
}

// Le contenu de mail.md, sans la clôture de code que Claude ajoute parfois ; une seule fin de ligne finale.
export function extraireMail(reponse: string): string {
  const cloture = /^\s*```[a-z]*\n([\s\S]*?)\n```\s*$/.exec(reponse);
  return `${(cloture ? cloture[1]! : reponse).trim()}\n`;
}

export async function redigerMail(d: DemandeMail, client?: Anthropic): Promise<string> {
  verifierCleClaude(client);
  // messages.parse (sans format) : seul à accepter « fallbacks » dans les types du SDK, comme redaction.ts.
  let reponse;
  try {
    reponse = await (client ?? new Anthropic()).messages.parse(
      {
        model: d.modele,
        max_tokens: 8000,
        output_config: { effort: 'medium' },
        messages: [{ role: 'user', content: construirePromptMail(d) }],
        fallbacks: 'default',
      },
      { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } },
    );
  } catch (e) {
    throw traduireErreurClaude(e);
  }
  if (reponse.stop_reason === 'refusal') throw new ErreurInterpretation(500, 'Claude a refusé de rédiger ce mail.');
  const texte = reponse.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('');
  if (!texte.includes('objet:')) throw new ErreurInterpretation(500, `Réponse de Claude inexploitable (arrêt : ${reponse.stop_reason}).`);
  return extraireMail(texte);
}

// Retouche ponctuelle du HTML construit d'un mail, sans toucher à mail.md ni à la charte.
export interface DemandeRetouche {
  consigne: string;
  html: string;
  modele: string;
}

export interface Retouche {
  remplacements: Remplacement[];
  resume: string;
}

export type RetoucherMail = (d: DemandeRetouche) => Promise<Retouche>;

const SchemaRetouche = z.object({
  remplacements: z.array(z.object({ avant: z.string(), apres: z.string() })),
  resume: z.string(),
});

export function construirePromptRetouche(d: DemandeRetouche): string {
  return `Voici le HTML d'un mail interne, construit pour Outlook (tableaux, styles en ligne, blocs VML entre <!--[if mso]> et <![endif]-->). L'auteur demande une retouche ponctuelle de ce mail seulement :

<demande>
${d.consigne}
</demande>

<html>
${d.html}
</html>

Réponds par une liste de remplacements : « avant » est un extrait exact du HTML, présent une seule fois (allonge-le si besoin pour qu'il soit unique), « apres » est ce qui le remplace. Touche le moins possible : garde la charte pour tout ce que la demande ne vise pas, et retouche aussi la version VML d'un bouton si tu changes sa couleur. N'utilise pas de CSS que Outlook ignore (flex, grid, position). « resume » dit en une phrase ce que tu as changé ; si la demande est impossible ou ambiguë, laisse la liste vide et explique pourquoi.
`;
}

export async function retoucherMail(d: DemandeRetouche, client?: Anthropic): Promise<Retouche> {
  verifierCleClaude(client);
  let reponse;
  try {
    reponse = await (client ?? new Anthropic()).messages.parse(
      {
        model: d.modele,
        max_tokens: 16000,
        output_config: { effort: 'medium', format: zodOutputFormat(SchemaRetouche) },
        messages: [{ role: 'user', content: construirePromptRetouche(d) }],
        fallbacks: 'default',
      },
      { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } },
    );
  } catch (e) {
    throw traduireErreurClaude(e);
  }
  if (reponse.stop_reason === 'refusal') throw new ErreurInterpretation(500, 'Claude a refusé de retoucher ce mail.');
  if (!reponse.parsed_output) throw new ErreurInterpretation(500, `Réponse de Claude inexploitable (arrêt : ${reponse.stop_reason}).`);
  return reponse.parsed_output;
}

import Anthropic from '@anthropic-ai/sdk';
import { ErreurInterpretation } from './consignes';

export function verifierCleClaude(client?: Anthropic): void {
  if (!client && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new ErreurInterpretation(500, 'Clé API Claude absente : définissez la variable d’environnement ANTHROPIC_API_KEY.');
  }
}

// Erreur de l'API Claude traduite pour le studio (503 : réessayer plus tard) ; toute autre erreur est rendue telle quelle.
export function traduireErreurClaude(e: unknown): unknown {
  if (e instanceof Anthropic.APIConnectionError) return new ErreurInterpretation(503, `Connexion à l’API Claude impossible : ${e.message}`);
  if (e instanceof Anthropic.RateLimitError) return new ErreurInterpretation(503, 'Limite de requêtes de l’API Claude atteinte, réessayez plus tard.');
  if (e instanceof Anthropic.APIError) {
    const statut = e.status !== undefined && e.status >= 500 ? 503 : 500;
    return new ErreurInterpretation(statut, `Erreur de l’API Claude (${e.status ?? 'sans statut'}) : ${e.message}`);
  }
  if (e instanceof Anthropic.AnthropicError) return new ErreurInterpretation(500, `Réponse de Claude inexploitable : ${e.message}`);
  return e;
}

import { lancerPipeline } from './pipeline';

// Une API Claude indisponible n'est pas un échec : analyse.json garde alors erreurSuggestions.
export const relancerSuggestions = (dossier: string) => lancerPipeline(['relancer-suggestions', dossier]);

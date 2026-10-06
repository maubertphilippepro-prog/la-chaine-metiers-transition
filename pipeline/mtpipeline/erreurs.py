class ErreurEntree(Exception):
    """Fichier d'entrée invalide (format, résolution, audio)."""


class ErreurSuggestions(Exception):
    """Échec de la génération des suggestions par Claude."""

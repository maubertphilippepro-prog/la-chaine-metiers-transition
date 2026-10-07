# Configuration d'OBS Studio pour la chaîne PMT

1. Télécharger OBS Studio sur https://obsproject.com (seul site officiel).
2. Paramètres → Vidéo : résolution de base et de sortie **1920x1080**, **30 images/s** (valeur commune, pas « fractionnelle »).
3. Paramètres → Sortie → Enregistrement : format **MP4** (ou MKV avec remuxage automatique en MP4), encodeur **NVIDIA NVENC H.264**, contrôle du débit **CQP 20**.
4. Paramètres → Audio : micro configuré, échantillonnage 48 kHz.
5. Scène « PMT » :
   - Source « Capture d'écran » en plein cadre (1920x1080).
   - Source « Périphérique de capture vidéo » (webcam) redimensionnée à environ 480x270, placée **en bas à gauche** avec une marge de 24 px.
   - Verrouiller les deux sources (icône cadenas) pour que la mise en page ne bouge plus.
6. Chemin d'enregistrement : `donnees/tournages/<AAAA-MM-JJ>-<sujet>/bruts/` (créer le dossier avant de tourner).

Le pipeline accepte aussi d'autres enregistreurs (par exemple une capture d'écran en .webm) : formats .mp4, .mkv, .mov ou .webm, en 16:9 d'au moins 1280x720 (mise à l'échelle en 1080p), avec une piste microphone. Les réglages ci-dessus restent les réglages recommandés.

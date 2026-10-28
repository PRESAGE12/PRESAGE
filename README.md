# PRESAGE — intégration de carrousels

## Structure retenue

Les liens de `index.html` vers `pages/planning.html`, `pages/actus.html`, `pages/chiffres.html` et `pages/visite.html`, les chemins `../assets/...` des pages, ainsi que `fetes.json` relatif dans `actus.js` établissent la structure racine + `pages/` + `assets/`. Les fichiers HTML sont donc placés dans `pages/`; les images de marque sont dans `assets/`. Cette reconstruction correspond aux chemins déclarés par le kiosque. Les sources uploadées étaient à plat, et aucun répertoire `assets/` n'y était fourni; les deux logos disponibles ont été copiés dans `assets/`.

## Photos

Déposez jusqu'à sept images `photo-01.jpg` à `photo-07.jpg` dans `images/photos-presage/`. Remplacez les textes alternatifs dans `data/photos.json` par des descriptions concrètes. Les entrées actuelles sont des emplacements; en l'absence des fichiers, le composant masque chaque diapositive défaillante (et le composant entier quand aucune image n'est accessible). Évitez de mettre les photos dans Google Drive comme liens de partage : le composant attend des fichiers servis par le site.

## Chiffres

Pour actualiser le nombre d'abonnés LinkedIn indiqué sur la page /chiffres, se rendre sur le script Google "Compteur heures et LinkedIn. Modifier la constante Ligne 363.

## Actus LinkedIn

Modifiez `data/linkedin-posts.json`, en ajoutant au plus cinq objets `{ "text": "...", "image": "", "alt": "..." }`. Les posts peuvent utiliser `**gras**`, `*italique*`, sauts de ligne et liens Markdown HTTPS `[libellé](https://...)`. L'affichage construit des nœuds DOM et n'interprète pas du HTML arbitraire. `image` peut rester vide; si une image locale est utilisée, déposez-la dans le dépôt et renseignez un chemin relatif au JSON. L'exemple actuel est explicitement fictif et doit être remplacé par une publication vérifiée. Le widget ne collecte pas LinkedIn.

Le site LinkedIn testé renvoie HTTP 999, y compris pour les chemins RSS/feed testés; aucune source RSS/API publique n'a été validée. Une automatisation nécessiterait un flux RSS tiers autorisé fourni et approuvé par l'équipe, un script d'import audité, et éventuellement GitHub Actions. Le fichier `.github/workflows/update-linkedin.yml` est entièrement commenté donc désactivé. Tout secret d'accès doit se trouver dans GitHub Secrets, jamais dans le code. Respectez les conditions d'utilisation du tiers et les droits sur les contenus.

## Publication GitHub Pages

Publiez le contenu du dépôt en gardant `index.html` à la racine, et les répertoires `pages/`, `assets/`, `data/`, `js/`, `css/` et `images/` à côté. Dans Settings → Pages, choisissez la branche et le dossier racine (ou le dossier de publication configuré par votre projet). Les chemins relatifs de ce site doivent rester sous la même racine publiée. Servir via HTTP(S), pas `file://`, car les JSON sont chargés avec `fetch`.

## Limites et vérification

Le lien Drive testé répond HTTP 200 et son HTML public contient le nom « Photos » et des métadonnées de dossier. Aucun nom de fichier photo exploitable n'a été trouvé dans la réponse reçue; aucune extraction officielle de liste de fichiers ni d'URL d'image directe n'a été validée. Il faut déposer manuellement les photos autorisées dans `images/photos-presage/`. Les données météo/fête/planning préexistantes gardent leurs sources existantes. Testez les chemins, le JSON et les consoles après remplacement des emplacements photo.

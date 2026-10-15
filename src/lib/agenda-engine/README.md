# Moteur de l'agenda (`agenda-engine`)

Le moteur de planification de Tutellia Agenda : modèles, récurrences, disponibilités, planificateur,
insertion dans un planning validé, « N'a pas eu lieu » (`domain/`), et temps de trajet IGN (`geo/`).

**Règle (décision D11 du plan `docs/plan-agenda-version-finale.md`) :** ce dossier n'importe **rien**
de Tutellia (un test le vérifie). Il pourra ainsi être repris tel quel pour le logiciel autonome.
Le reste de Tutellia l'utilise via `@/lib/agenda-engine/domain` et `@/lib/agenda-engine/geo`.

- `domain/` est **pur** : aucune entrée/sortie, aucune horloge. La date du jour et le modèle de trajet sont passés en paramètre.
- `geo/` reçoit `fetch` et le cache en paramètre ; seules les adresses vont à l'IGN, en HTTPS.

```
npm run test:agenda-engine        # tests + couverture (≥ 90 %)
npm run typecheck:agenda-engine   # TypeScript strict propre au moteur
npm run bench:agenda-engine       # budget : 4 semaines, 60 personnes, 30 rendez-vous < 300 ms
```

Construit et vérifié d'abord dans `F:\OrigAI\Agenda` (banc d'essai, page `pnpm playground`).

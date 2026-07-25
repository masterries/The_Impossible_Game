# The Impossible Game

Ein Browser-Remake von World's Hardest Game. Man steuert einen roten Würfel, weicht blauen
Kugeln aus, sammelt die Münzen ein und läuft ins grüne Feld. Es gibt sechs Level und keine
Speicherpunkte.

Gebaut mit TypeScript, Vite und Canvas 2D. Ohne Spiel-Engine, ohne Bilder, ohne
Sounddateien: Grafik und Töne entstehen zur Laufzeit. Das JS-Bundle liegt bei rund 22 kB
(8 kB gzip), dazu kommen 3 kB CSS.

## Spielen

| Taste                 | Wirkung           |
| --------------------- | ----------------- |
| Pfeiltasten oder WASD | Bewegen           |
| Leertaste             | Menü bestätigen   |
| R                     | Level neu starten |
| P oder Esc            | Pause             |

Das grüne Ziel öffnet sich erst, wenn alle Münzen des Levels eingesammelt sind; solange
pulsiert es dunkel. Jeder Treffer setzt Level, Münzen und Gegner zurück. Die geringste
Anzahl Tode über einen kompletten Durchlauf wird im localStorage gespeichert.

## Entwickeln

```bash
npm install
```

```bash
npm run dev
```

| Skript              | Zweck                                            |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | Entwicklungsserver mit automatischem Neuladen    |
| `npm run build`     | Typprüfung und Produktions-Build nach `dist/`    |
| `npm run preview`   | `dist/` lokal ausliefern                         |
| `npm run typecheck` | nur `tsc --noEmit`                               |

Der Entwicklungsserver nutzt Port 5173 oder, falls gesetzt, `$PORT`.

## Container

Zweistufiger Build: Node erzeugt das Bundle, ausgeliefert wird es von nginx. Im fertigen
Image steckt weder Node noch `node_modules`.

```bash
docker build -t impossible-game .
```

```bash
docker run --rm -p 8080:80 impossible-game
```

Danach http://localhost:8080 aufrufen. `/healthz` antwortet mit `ok` und wird auch vom
HEALTHCHECK des Containers benutzt.

Die nginx-Konfiguration liegt in [`docker/nginx.conf`](docker/nginx.conf). Sie schaltet
gzip ein, cacht die gehashten Dateien unter `/assets/` ein Jahr lang, liefert `index.html`
mit `no-cache` aus und setzt ein paar übliche Schutz-Header. Unbekannte Pfade ergeben einen
echten 404, weil das Spiel eine einzelne Seite ohne eigenes Routing ist.

## Auf dem Server hinter Traefik

Vorausgesetzt wird ein laufender Traefik mit dem externen Netzwerk `traefik-net`, dem
Einstiegspunkt `websecure` und dem Zertifikatsdienst `letsencrypt`. Genau die Labels, die
auch andere Dienste in diesem Aufbau benutzen, stehen in
[`docker-compose.yml`](docker-compose.yml).

Auf dem Server das Repository klonen, Domain eintragen, starten:

```bash
cp .env.example .env
```

```bash
docker compose up -d --build
```

`GAME_HOST` aus der `.env` bestimmt die Domain im Traefik-Router. Fehlt die Variable, bricht
Compose mit einer Meldung ab, statt eine falsche Route anzulegen.

### Ohne Quellcode auf dem Server

Der Arbeitsablauf in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) baut bei jedem
Push auf `main` ein Image und lädt es in die GitHub Container Registry. Der Name steht dort
fest auf `ghcr.io/<dein-github-name>/impossible-game`, hängt also nicht am
Repository-Namen. Auf dem Server reicht dann:

```bash
docker compose -f docker-compose.ghcr.yml up -d
```

Dafür in der `.env` zusätzlich `GAME_IMAGE` setzen. Ist das Paket privat, vorher einmalig
`docker login ghcr.io` mit einem Zugriffstoken (Berechtigung `read:packages`).

Aktualisieren:

```bash
docker compose -f docker-compose.ghcr.yml pull && docker compose -f docker-compose.ghcr.yml up -d
```

Beide Compose-Dateien beschreiben denselben Container unter demselben Projektnamen, also
immer nur eine davon benutzen.

## Level bearbeiten

Ein Level ist ein Raster aus 20 × 12 Zeichen in [`src/game/levels.ts`](src/game/levels.ts):

| Zeichen | Bedeutung        |
| ------- | ---------------- |
| `#`     | Wand oder Leere  |
| `.`     | Boden            |
| `S`     | Startzone (grün) |
| `E`     | Zielzone (grün)  |
| `C`     | Münze            |

Gegner beschreiben drei Helfer. Längen sind Kacheln, `speed` sind Kacheln pro Sekunde,
`phase` (0 bis 1) verschiebt den Startpunkt innerhalb eines Zyklus.

```ts
hori(4, 3, 16, 6.5, 0.25); // Zeile 4, Spalte 3 bis 16, versetzt um einen Viertelzyklus
vert(9, 1, 10, 5);         // Spalte 9, Zeile 1 bis 10
ring([9, 6], 3.5, 7, 8);   // 8 Gegner im Kreis, Radius 3,5
```

Ein Unterschied, der beim Bauen leicht stolpern lässt: `hori` und `vert` erwarten
Kachelindizes und rechnen selbst auf die Kachelmitte um. `ring` bekommt den Mittelpunkt
direkt, dort ist `[9, 6]` die Ecke zwischen vier Kacheln und `[9.5, 6.5]` die Mitte von
Kachel (9|6).

Beim Laden wird das Raster geprüft. Falsche Zeilenzahl, falsche Zeilenlänge, unbekannte
Zeichen oder eine fehlende Start- beziehungsweise Zielzone werfen sofort einen Fehler mit
Levelnamen.

Tempo, Kachelgröße, Farben und Schriften stehen in
[`src/game/config.ts`](src/game/config.ts).

## Aufbau

```
src/
  engine/          spielunabhängige Bausteine
    loop.ts        Spielschleife mit festem Zeitschritt
    input.ts       Tastatur, gedrückt und gerade gedrückt
    renderer.ts    Canvas mit fester Logikauflösung, HiDPI-Skalierung
    audio.ts       erzeugte Töne über die Web Audio API
    math.ts        Vektor- und Kollisionshelfer
  game/
    config.ts      Konstanten
    types.ts       Datenmodell für Level und Gegner
    levels.ts      die sechs Level
    level.ts       geladenes Level: Kacheln, Münzen, Zonen, Gegner
    enemy.ts       Bewegung auf Streckenzügen und Kreisbahnen
    player.ts      Bewegung und Wandkollision
    particles.ts   Effekte für Tod und Münzen
    game.ts        Zustandsautomat, Kollisionen, Zeichnen
  main.ts          Einstiegspunkt
  style.css        Seitenrahmen um das Spielfeld
docker/nginx.conf  Auslieferung im Container
```

Zwei Details bestimmen das Spielgefühl.

Die Schleife rechnet mit festem Zeitschritt (1/120 s) und zeichnet einmal pro Bild. Damit
ist das Spiel auf 60 und auf 240 Hz gleich schwer. Bei variablem `dt` käme man mit hoher
Bildrate durch Lücken, die es bei 60 Hz nicht gibt.

Gegner haben keinen veränderlichen Zustand. `Enemy.positionAt(t)` ist eine reine Funktion
der Levelzeit, ein Tod setzt nur `Level.time` auf 0. Jeder Versuch sieht dadurch exakt
gleich aus, und ein Level lässt sich auswendig lernen statt zu würfeln.

## Hinweis

Fan-Remake ohne Verbindung zu Snubby Land oder Stephen Critoph, den Urhebern von World's
Hardest Game. Der Code hier ist eine Neuimplementierung, es wurden keine Originaldateien
verwendet.

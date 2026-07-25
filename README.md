# The Impossible Game

A browser remake of World's Hardest Game. You steer a red cube, dodge blue balls, collect
every coin and reach the green field. Twelve levels, no checkpoints, and a global
scoreboard.

Built with TypeScript, Vite and Canvas 2D. No game engine, no images, no audio files:
graphics and sound are generated at runtime. The bundle is about 40 kB of JavaScript
(14 kB gzipped) plus 6 kB of CSS. The scoreboard API is plain Node with `node:sqlite` and
has no npm dependencies at all.

## Playing

| Input                 | Effect              |
| --------------------- | ------------------- |
| Arrow keys or WASD    | Move                |
| Drag on the playfield | Move (touch)        |
| Space or tap          | Confirm a dialog    |
| R                     | Restart the level   |
| P or Esc              | Pause               |

The green goal only opens once every coin in the level is collected; until then it pulses
dark. Any hit resets the level, the coins and the enemies. Your personal best is kept in
localStorage, and clearing level 1 already puts the run on the scoreboard.

On phones the game is played by dragging anywhere on the field: a virtual stick appears
under your finger. Pause and restart sit as buttons in the status bar, so no keyboard is
needed. When the canvas gets narrow the status bar and the dialogs switch to a larger
layout, and the page suggests turning the phone sideways.

The Fullscreen button hides the page around the game and asks for landscape. Where the
Fullscreen API is unavailable, most notably iOS Safari, a CSS-only immersive mode does the
same job inside the browser window.

### Modes

| Mode         | What it is                                                                     |
| ------------ | ------------------------------------------------------------------------------ |
| Campaign     | All twelve levels in order. Ranked on the campaign board.                       |
| Sudden death | Same levels, one hit ends the run. Its own board, where a finished run means zero deaths, so it ranks by time. |
| Practice     | Any single level, picked from the grid under the game. Never submitted anywhere. |

### Themes

Classic, Midnight, Paper and Neon. They only swap colours, the beveled window look stays,
and the choice is kept in localStorage.

### Mechanics

Levels 1 and 2 are plain. After that a mechanic joins every few levels and they start
combining.

| From level | Mechanic    | Behaviour                                                                       |
| ---------- | ----------- | ------------------------------------------------------------------------------- |
| 3          | Conveyors   | Striped tiles drag you at 110 px/s. You can walk against them, just not quickly.  |
| 5          | Gates       | Two groups of red doors take turns. Standing in one when it closes kills you, and it blinks first. |
| 9          | Teleporters | Matching rings are pairs. Step on one and you come out of the other.              |

### Enemies

| Kind    | Behaviour                                                                            |
| ------- | ------------------------------------------------------------------------------------ |
| Ball    | The classic blue circle on a line, a polyline or a ring.                             |
| Pulse   | Sits still and breathes: the deadly radius grows and shrinks on a cycle.              |
| Turret  | Fires a bullet along one axis every few seconds. Bullets are not objects, the live ones follow from the firing interval. |
| Chaser  | Wakes up after a delay and homes in on you. Slower than the player, so it is pressure rather than a death sentence. |

Everything except the chaser is a pure function of the level time. The chaser is the one
piece of state in a level, and therefore the one thing that cannot be memorised as a fixed
pattern. It is reset along with the level on every death.

## Developing

```bash
npm install
```

The game and the scoreboard API run as two processes. The dev server proxies `/api` to the
API, so both are same-origin during development just like in production.

```bash
npm run dev
```

```bash
npm run api
```

| Script              | Purpose                                       |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Dev server with hot reload on port 5173       |
| `npm run api`       | Scoreboard API on port 8787                   |
| `npm run build`     | Type check and production build into `dist/`  |
| `npm run preview`   | Serve `dist/` locally                         |
| `npm run typecheck` | `tsc --noEmit` only                           |
| `npm test`          | Smoke test for the scoreboard API             |

Needs Node 22.13 or newer, because the API imports `node:sqlite` without a flag.

`PORT` sets the port of whichever process you start. `API_PORT` only tells the dev server
where to find the API, so moving the API means starting it with `PORT` and giving the dev
server the same value as `API_PORT`. Without the API the game is fully playable, the board
just reports that it is offline.

## Scoreboard

You are on the board as soon as you clear level 1. The entry is created there and updated
after every further level, so it always shows how far that run got. Stop playing and it
stays where it is, listed as unranked. Only a run that clears all twelve levels gets a rank,
sorted by fewest deaths first, then by the faster time.

The server owns the level count, so a client cannot claim completion early. It defaults to
12 and can be overridden with the `LEVEL_COUNT` environment variable if you add levels.

Campaign and sudden death have separate boards. Practice runs are never sent, and the
server rejects `mode: practice` outright rather than trusting the client about it.

One row per run, not per player. A new run means a new row, so a bad attempt does not
overwrite a good one. If no name is entered, the game picks one like `Player 4821` rather
than dropping the run.

| Route                   | Method | Purpose                                                     |
| ----------------------- | ------ | ----------------------------------------------------------- |
| `/api/health`           | GET    | Liveness, also used by the container healthcheck            |
| `/api/scores?mode=campaign&limit=10` | GET | Ranked entries plus the unranked ones, per mode    |
| `/api/runs`             | POST   | Issues a ticket for a run that is about to start             |
| `/api/scores`           | POST   | Creates or updates this run's entry, needs a valid ticket    |
| `/api/scores/<id>`      | DELETE | Removes one entry, needs `x-admin-token`                    |

The ticket identifies a run for its whole lifetime. Submissions may only ever report a
higher level than before, which is also what caps how often one ticket can write.

### About cheating

There is no login, so the board cannot be trustworthy in a strict sense. What it does have:

- The server issues a ticket when a run starts and checks on every submission that enough
  real time has passed on the server side. A ticket is signed with `SCORE_SECRET`, expires
  after six hours and can only ever move its run forward.
- Names, death counts and times are validated and clamped. Anything claiming less than four
  seconds per cleared level is rejected outright.
- Rate limits per IP: 120 submissions per hour (twelve levels plus room for retries), 120 reads
  per minute, 20 admin deletes per hour. The address comes from the last `X-Forwarded-For`
  entry, the one Traefik appends, so a client cannot pick its own bucket by sending the
  header itself.

That stops replays, curl spam and obviously faked times. It does not stop somebody who
reads the client code and drives the API deliberately. If the board gets polluted, set
`ADMIN_TOKEN` and delete individual entries:

```bash
curl -X DELETE -H "x-admin-token: $ADMIN_TOKEN" https://your-host/api/scores/42
```

## Containers

Two images. The web image is a two-stage build: Node produces the bundle, nginx serves it,
and the result contains neither Node nor `node_modules` (48 MB). The API image is Node 24
with a single JavaScript file (164 MB) and runs as an unprivileged user.

```bash
docker build -t impossible-game .
```

```bash
docker build -t impossible-game-api ./server
```

For a quick look at the game alone, without the scoreboard:

```bash
docker run --rm -p 8080:80 impossible-game
```

The nginx config lives in [`docker/nginx.conf`](docker/nginx.conf). It enables gzip, caches
the hashed files under `/assets/` for a year, serves `index.html` with `no-cache` and sets
the usual protection headers. Unknown paths return a real 404, because the game is a single
page without its own routing.

## Deploying behind Traefik

Requires a running Traefik with the external network `traefik-net`, the entrypoint
`websecure` and the certificate resolver `letsencrypt`.

Both containers share one hostname. Traefik routes `/api` to the scoreboard with a higher
router priority, everything else goes to nginx. That keeps the API same-origin, so there is
no CORS to configure.

Clone the repository on the server, fill in the environment, start:

```bash
cp .env.example .env
```

`SCORE_SECRET` ships empty on purpose, so Compose refuses to start until it is filled in.
Generate one and put it into `.env`:

```bash
openssl rand -hex 32
```

```bash
docker compose up -d --build
```

`GAME_HOST` decides the domain in the Traefik router. If a required variable is missing,
Compose stops with a message instead of creating a broken route. The scoreboard database
lives in the named volume `impossible-game_scores` and survives rebuilds.

### Without source code on the server

The workflow in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) builds both images on
every push to `main` and pushes them to the GitHub Container Registry. The names are fixed
to `ghcr.io/<your-github-name>/impossible-game` and `-api`, so they do not depend on the
repository name. On the server:

```bash
docker compose -f docker-compose.ghcr.yml up -d
```

That needs `GAME_IMAGE` and `API_IMAGE` in `.env` as well. If the packages are private, run
`docker login ghcr.io` once with a personal access token that has `read:packages`.

Updating:

```bash
docker compose -f docker-compose.ghcr.yml pull && docker compose -f docker-compose.ghcr.yml up -d
```

Both compose files describe the same containers under the same project name, so only ever
use one of them.

## Editing levels

A level is a 20 Ã— 12 character grid in [`src/game/levels.ts`](src/game/levels.ts):

| Character   | Meaning                                                     |
| ----------- | ----------------------------------------------------------- |
| `#`         | Wall or void                                                |
| `.`         | Floor                                                       |
| `S`         | Start zone                                                  |
| `E`         | End zone                                                    |
| `C`         | Coin                                                        |
| `^ > v <`   | Conveyor floor, pushing that way                            |
| `1` / `2`   | Gate of group A / B, the two alternate                      |
| `a` `b` `c` | Teleporter, each letter used exactly twice to form a pair    |

`gateCycle` sets the seconds for a full open-closed cycle. Coins that belong on a tile which
already carries a mechanic go into the separate `coins` array as `[column, row]`, because
one character per tile cannot hold both.

Enemies are described by three helpers. Lengths are tiles, `speed` is tiles per second and
`phase` (0 to 1) shifts the starting point within one cycle.

```ts
hori(4, 3, 16, 6.5, 0.25); // row 4, column 3 to 16, offset by a quarter cycle
vert(9, 1, 10, 5);         // column 9, row 1 to 10
ring([9, 6], 3.5, 7, 8);   // 8 enemies in a circle, radius 3.5
```

One difference that is easy to trip over: `hori` and `vert` take tile indices and convert to
the tile centre themselves. `ring` takes the centre directly, so `[9, 6]` is the corner
where four tiles meet and `[9.5, 6.5]` is the middle of tile (9|6).

The grid is validated on load. A wrong row count, a wrong row length, an unknown character
or a missing start or end zone throws immediately, naming the level.

Speed, tile size, colours and fonts live in [`src/game/config.ts`](src/game/config.ts).

## Layout

```
src/
  engine/          reusable, game-independent pieces
    loop.ts        fixed timestep game loop
    input.ts       keyboard, isDown and wasPressed
    pointer.ts     touch and mouse, virtual stick and taps
    renderer.ts    canvas with a fixed logical resolution, HiDPI scaling
    audio.ts       synthesised tones over the Web Audio API
    math.ts        vector and collision helpers
  game/
    config.ts      constants
    types.ts       level and enemy data model
    levels.ts      the twelve levels
    level.ts       a loaded level: tiles, coins, zones, enemies
    enemy.ts       the four enemy kinds, each emitting deadly circles
    player.ts      movement and wall collision
    particles.ts   death and coin effects
    game.ts        state machine, collisions, rendering
  scoreboard.ts    client for the scoreboard API
  main.ts          entry point
  style.css        the page around the canvas
server/
  index.js         scoreboard API, no dependencies
  test.js          HTTP smoke test against the real server
docker/nginx.conf  how the container serves the build
```

Two details shape how the game feels.

The loop runs at a fixed timestep (1/120 s) and renders once per frame, so the game is
equally hard at 60 and at 240 Hz. With a variable `dt` a high frame rate would let you
through gaps that do not exist at 60 Hz.

Enemies hold no mutable state. `Enemy.positionAt(t)` is a pure function of the level time
and a death only resets `Level.time` to 0. Every attempt therefore looks exactly the same,
which makes a level something you learn rather than something you gamble on.

## Note

Fan remake, not affiliated with Snubby Land or Stephen Critoph, the authors of World's
Hardest Game. This is a reimplementation, no original files were used.

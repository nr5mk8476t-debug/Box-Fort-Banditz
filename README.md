# Box Fort Banditz

A chaotic first-person 3D browser party game for 2–4 players (plus solo), set in the city of **Trashington**.

**Status: Overhaul Slice 2A (the new 230 m city: towers with 15 walk-in shops, upstairs floors, the plaza park + pond) on top of Phase 5A (day/night cycle, fort raids, pawn shop). Online games are hosted in the room creator's browser.** Placeholder art and sound. See `docs/design-decisions.md` for the agreed design and `docs/test-plan.md` for how everything is tested.

## Tech

| Part | What | Why |
|---|---|---|
| `client/` | Babylon.js 9 + TypeScript + Vite | 3D in the browser with animation, physics, particles, audio |
| `server/` | Colyseus 0.18 (Node) | Matchmaking: room codes + introducing players to the host's browser (and optional server-hosted rooms with `?net=server`) |
| `client/src/p2p/` | WebRTC data channels | The room creator's browser runs the game; friends connect straight to it |
| `shared/` | Plain TypeScript | Game rules used by BOTH sides (movement, loot, pedestrians, punching), so client and server always agree |

## Run it on your computer

Needs [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dev:server     # terminal 1: game server on http://localhost:2567
npm run dev:client     # terminal 2: game on http://localhost:5173
```

Open http://localhost:5173. For multiplayer testing, click **Create Room**, then **Copy Link** and open the link in another browser window (or another computer on your network, using your computer's IP instead of `localhost`).

## Controls

- Click **CLICK TO PLAY** to capture the mouse (ESC releases it and opens the menu)
- **WASD** / arrow keys move, **Shift** sprint (uses stamina), **Space** jump / climb a ledge you face, **C** crouch (sprint + C = belly slide), **Q** dodge, **E** grab / pocket / search a dumpster (mash **E** in a tug of war), **HOLD R** rob a shop till, **G** drop, **mouse wheel** or **1-4** choose what's in your hands (1-3 pockets, 4 = fists), **left click** punch with your left fist (fists out) or **hold left click** / **F** to wind up and throw what you're holding (every item, even giant ones: a clumsy heave), **right click** reserved for special items, **ENTER** start the match (host / solo)
- **Health** (heart) and **stamina** (lightning bolt) are bottom-left; the yellow **Q** chip lights up when a dodge is ready
- **In jail:** the **mouse** moves your lock pick: **click** a pin to select it, then **click** / **SPACE** when its top is in the green (**A / D** also choose pins)
- If a page refuses mouse capture, the game falls back to **hold left mouse + drag** to look

## Tests

```bash
npm test                 # movement + naming rules (fast, no browser)
./scripts-run-e2e.sh     # real headless Chrome windows + real server (about 2 min)
LATENCY=110 ./scripts-run-e2e.sh   # same, with ~110 ms simulated lag (Sydney -> Singapore)
npx tsx tests/signal-smoke.ts      # matchmaking smoke test (needs the server running)
```

Screenshots from the browser test land in `test-output/`.

## Configuration

- `VITE_TURN_URL`, `VITE_TURN_USER`, `VITE_TURN_PASS` (client build, optional): a TURN relay for friends whose network blocks direct connections.
- `?net=server` (in the game address): play a server-hosted room instead of hosting in the browser.
- `VITE_SERVER_URL` (client build): address of the game server (matchmaking), e.g. `https://bfb-server.onrender.com`. Defaults to the same machine on port 2567.
- `PORT` (server): defaults to 2567.
- `COLYSEUS_LATENCY` (server, testing only): simulated round-trip lag in ms.

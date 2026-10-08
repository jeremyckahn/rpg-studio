# AI Companion

RPG Studio is designed so an **AI agent can build alongside you**. A small local program, the **companion bridge**, lets an agent read your project and edit it while the editor updates live in front of you.

Nothing is sent to any cloud service by RPG Studio. The bridge runs on **your computer**, and the agent connects to it. What the agent itself does (which AI model it uses, what it sends there) is up to the agent you run.

## What an agent can do

| Capability            | Examples                                                                                                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Read** the project  | Summary of maps, actors and counts; one map's full data; any database table or record; the list of assets                                                                                                      |
| **Learn the rules**   | Fetch the exact JSON Schema for maps, actors, classes, items, skills, enemies, events and every kind of edit                                                                                                   |
| **Check paths**       | Ask whether a character can walk from A to B on a map, using the map's real collision                                                                                                                          |
| **Edit** the project  | Paint and fill tiles, set collision, create, resize, rename and delete maps, add and remove layers, create, change and delete database records, write events, rename the project and change the start position |
| **Batch** edits       | Many edits applied **all or nothing**                                                                                                                                                                          |
| **Add art and sound** | Write PNG, JPEG, GIF, WebP, `.piskel`, OGG, MP3, M4A and WAV files under `img/` and `audio/` (up to 12 MB each)                                                                                                |

An agent **cannot** touch your files directly, edit plugin code, or write outside `img/` and `audio/`.

## Safety

- **Everything is validated.** Each edit goes through the same checks as your own edits: wrong types, out-of-range values, unknown fields and broken references are refused with an explanation the agent can read and act on.
- **Undo works.** Each request from an agent (a single edit or a whole batch) is **one undo step**. Press Ctrl+Z to revert what the agent just did.
- **You see it happen.** Edits show up on the map as they are made.
- **Local only.** The bridge listens on `127.0.0.1`. Web pages in your browser can try to reach local ports, so the bridge refuses any agent connection that comes from a web page and only accepts the editor from allowed addresses. You can also require a **shared token**.

## Setting it up

You need [Node.js](https://nodejs.org) 22+ and [pnpm](https://pnpm.io) 12, and a copy of the source:

```bash
git clone https://github.com/jeremyckahn/rpg-studio.git
cd rpg-studio
pnpm install
```

### 1. Start the bridge

```bash
pnpm dev:companion
```

This listens on `ws://localhost:8080`.

### 2. Connect the editor

- **Running the editor from source** (`pnpm dev`, which serves `http://localhost:5173`): nothing more to configure.
- **Using the hosted editor** at <https://rpg-studio.com>: tell the bridge to trust it. Stop the bridge and start it with:

  ```bash
  pnpm dev:companion --allow-origin https://rpg-studio.com
  ```

  Options go straight after the command (do not add a `--` separator, which makes pnpm ignore them). `--allow-origin` can be repeated, and `--port <n>` changes the port (then use `ws://localhost:<n>` in the editor).

  (Some browsers block a secure page from reaching a local WebSocket. If that happens, run the editor from source instead.)

Then, in the editor, click the **Companion** button in the top bar, leave the address as `ws://localhost:8080`, enter a token if you started the bridge with one, and click **Connect**. The button turns green and reads **Companion: connected**. If the connection fails, the dialog says why; see below.

### Optional: require a token

```bash
pnpm dev:companion --token my-secret
```

Enter `my-secret` in the **Token** field in the editor and in your agent. Tokens are only for local protection; use something you do not use elsewhere.

### 3. Run an agent

The repository includes a **reference agent** that demonstrates the full flow. It reads your project, reshapes a map, adds an actor, draws a sprite and checks a path. Try it with the editor connected:

```bash
pnpm --filter @rpgstudio/companion-bridge demo
```

(Undo with Ctrl+Z after each step if you want your project back.)

To build your own agent in TypeScript or JavaScript:

```ts
import { connectAgent } from '@rpgstudio/companion-bridge'

const agent = await connectAgent({ url: 'ws://localhost:8080' })
await agent.waitForEditor()
const summary = await agent.query({ type: 'GET_PROJECT_SUMMARY' })
await agent.batch([
  {
    type: 'project/fillArea',
    payload: { mapId: 1, layer: 0, tile: 3, startX: 2, startY: 2, endX: 6, endY: 4 },
  },
])
```

Agents in other languages (Python, for example) can speak the protocol directly: it is plain JSON over a WebSocket. The complete message reference is [`docs/companion-protocol.md`](../companion-protocol.md) in the repository.

## The browser console

With or without the bridge, the editor exposes a small API in the browser's developer console:

```js
RPGStudio.query({ type: 'GET_PROJECT_SUMMARY' })
RPGStudio.query({ type: 'GET_MAP_DATA', id: 1 })
```

Edits made this way go through the same validation and undo as everything else.

## Troubleshooting the connection

| What you see                                                       | What it means                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Could not reach … retrying**                                     | The bridge is not running, or the browser is blocking the connection. Start `pnpm dev:companion`; the editor keeps retrying. On the hosted (`https://`) editor, the message also hints that the browser may be blocking the page from reaching your computer; check the site permissions (the icon left of the address bar) and allow local network access, or run the editor from source. |
| _"The server does not allow this page (…) to connect"_ (code 4403) | The bridge only trusts `localhost:5173` and `localhost:4173` unless told otherwise. Stop it and restart with the command the message shows, for example `pnpm dev:companion --allow-origin https://rpg-studio.com`. **This is the usual problem when using the hosted editor.**                                                                                                            |
| _"The server refused the token"_ (code 4401)                       | The token is missing or wrong. Enter the one the bridge was started with (`--token`).                                                                                                                                                                                                                                                                                                      |
| Replaced (code 4000)                                               | Another editor tab connected to the same bridge and took over. Use **one** editor tab per bridge: with two tabs open, they keep replacing each other.                                                                                                                                                                                                                                      |
| An agent is rejected immediately                                   | Agents must be scripts. A connection that comes from a web page is refused on purpose.                                                                                                                                                                                                                                                                                                     |
| "No editor is connected"                                           | The agent connected, but the editor has not. Click **Connect** in the editor.                                                                                                                                                                                                                                                                                                              |
| "The editor did not answer in time"                                | The editor took longer than 30 seconds to respond. Check the tab is open and not frozen.                                                                                                                                                                                                                                                                                                   |

For the security design and wire format see the repository's [`docs/companion-protocol.md`](../companion-protocol.md).

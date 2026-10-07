# Plugins

RPG Studio is built around **plugins**. The map editor, database editor and sprite editor are themselves plugins, and the design lets you add your own: new editor panels, extra game behaviour, new kinds of data.

> **Status:** plugin support is **partly complete**. Read [What works today](#what-works-today) before you build on it.

## How plugins work

A plugin is a folder inside your project at `plugins/<plugin-id>/` with up to four files:

```
plugins/acme.quest-log/
  manifest.json   name, version, what the plugin may do, where its code is
  shared.js       loaded by both the editor and the game: schemas and pure logic
  editor.js       loaded only by the editor: panels and tools
  engine.js       loaded only by the exported game: behaviour and systems
```

- Plugins are plain **JavaScript modules**. Write them in TypeScript if you like, then compile each entry to one self-contained file.
- A plugin lists in its manifest exactly which **capabilities** it needs (for example `ui`, `store`, `files:read`, `files:write`), and can only use those. It cannot reach anything it did not declare.
- A project turns a plugin on by listing its id in `meta.plugins` in `project.json`.
- **Two heads, one plugin.** The exported game only ever loads the `shared` and `engine` parts. Editor code never ships in a game.

## What works today

| Capability                                                                                   | Status                                                                                                              |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Built-in editors (map, database, sprite) registered as plugins                               | Works                                                                                                               |
| Game side: an exported game loads and runs a project's plugins (`shared.js` and `engine.js`) | Works                                                                                                               |
| Export includes only enabled plugins' game-side files                                        | Works                                                                                                               |
| Editor side: loading a project's `plugins/<id>/editor.js` when the project is opened         | **Not yet.** The editor can run plugins it is given, but does not load them from your project folder automatically. |
| Installing plugins from a menu or registry                                                   | Not yet                                                                                                             |
| The `render` capability                                                                      | Reserved; not available, so a plugin that declares it is rejected                                                   |

So today you can write **game-side** plugins that extend the engine in your exported game, but project plugins do not yet add panels to the editor.

## Writing one

The full contract is in the repository, with a worked example: [`docs/plugins.md`](../plugins.md). It covers the manifest format, capabilities, lifecycle and ordering between plugins, how a plugin declares data schemas, and how to test a plugin without a browser.

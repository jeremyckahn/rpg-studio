"use strict";
/**
 * Runs inside the embedded Piskel page (a classic script, not a module) and
 * connects it to the RPG Studio editor over `postMessage`.
 *
 * Messages from the editor (`source: "rpgstudio"`):
 *   - `open`:  `{ requestId, name, piskel }`  load a `.piskel` document
 *   - `requestSave`: `{ requestId }`           send the current document back
 * Messages to the editor (`source: "rpgstudio-piskel"`):
 *   - `ready`, `opened { requestId }`, `error { message }`
 *   - `saved { requestId?, piskel, png, width, height, frames }`
 *
 * Only same-origin messages from the parent window are accepted.
 */
/* The IIFE keeps every name out of Piskel's global scope. */
;
(() => {
    const HOST_SOURCE = 'rpgstudio';
    const ADAPTER_SOURCE = 'rpgstudio-piskel';
    const globals = window;
    const isRecord = (value) => typeof value === 'object' && value !== null;
    const post = (message) => {
        window.parent.postMessage({ source: ADAPTER_SOURCE, ...message }, window.location.origin);
    };
    const controller = () => { var _a, _b; return (_b = (_a = globals.pskl) === null || _a === void 0 ? void 0 : _a.app) === null || _b === void 0 ? void 0 : _b.piskelController; };
    const fail = (error) => {
        post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    };
    /** All frames, each flattened across layers, laid out left to right as one PNG. */
    const renderSheet = (source) => {
        const frames = source.getFrameCount();
        const width = source.getWidth();
        const height = source.getHeight();
        const sheet = document.createElement('canvas');
        sheet.setAttribute('width', String(width * frames));
        sheet.setAttribute('height', String(height));
        const context = sheet.getContext('2d');
        if (!context)
            throw new Error('Canvas is not available');
        for (let index = 0; index < frames; index += 1) {
            context.drawImage(source.renderFrameAt(index, true), index * width, 0);
        }
        return sheet.toDataURL('image/png');
    };
    const save = (requestId) => {
        const source = controller();
        if (!source) {
            fail(new Error('The editor is not ready yet'));
            return;
        }
        post({
            type: 'saved',
            ...(typeof requestId === 'string' ? { requestId } : {}),
            piskel: source.serialize(),
            png: renderSheet(source),
            width: source.getWidth(),
            height: source.getHeight(),
            frames: source.getFrameCount(),
        });
    };
    const open = (requestId, piskel) => {
        var _a, _b, _c;
        const source = controller();
        const deserializer = (_c = (_b = (_a = globals.pskl) === null || _a === void 0 ? void 0 : _a.utils) === null || _b === void 0 ? void 0 : _b.serialization) === null || _c === void 0 ? void 0 : _c.Deserializer;
        if (!source || !deserializer || typeof piskel !== 'string') {
            fail(new Error('Cannot open the document'));
            return;
        }
        // Piskel's deserializer takes the parsed document, not its JSON text.
        deserializer.deserialize(JSON.parse(piskel), (loaded) => {
            var _a, _b;
            source.setPiskel(loaded);
            // Tell Piskel this document matches what is stored, so it does not warn about unsaved work.
            const saved = (_a = globals.Events) === null || _a === void 0 ? void 0 : _a.PISKEL_SAVED;
            if (saved)
                (_b = globals.$) === null || _b === void 0 ? void 0 : _b.publish(saved);
            post({ type: 'opened', ...(typeof requestId === 'string' ? { requestId } : {}) });
        }, fail);
    };
    window.addEventListener('message', (event) => {
        if (event.source !== window.parent || event.origin !== window.location.origin)
            return;
        const { data } = event;
        if (!isRecord(data) || data['source'] !== HOST_SOURCE)
            return;
        try {
            if (data['type'] === 'open')
                open(data['requestId'], data['piskel']);
            else if (data['type'] === 'requestSave')
                save(data['requestId']);
        }
        catch (error) {
            fail(error);
        }
    });
    /** A button inside Piskel's own window, for people who work there rather than in the editor's toolbar. */
    const addSaveButton = () => {
        const button = document.createElement('button');
        button.setAttribute('type', 'button');
        button.setAttribute('id', 'rpgstudio-save');
        button.append('Save to project');
        button.setAttribute('style', 'position:fixed;top:8px;right:8px;z-index:99999;padding:6px 12px;border:0;border-radius:4px;' +
            'background:#1976d2;color:#fff;font:600 13px sans-serif;cursor:pointer');
        button.addEventListener('click', () => {
            try {
                save(undefined);
            }
            catch (error) {
                fail(error);
            }
        });
        document.body.append(button);
    };
    // Piskel finishes starting up after this script runs; announce once it can take commands.
    const waitUntilReady = window.setInterval(() => {
        if (!controller())
            return;
        window.clearInterval(waitUntilReady);
        addSaveButton();
        post({ type: 'ready' });
    }, 100);
})();

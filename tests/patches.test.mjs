/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import ts from "typescript";

const result = await build({
    entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
    bundle: true, platform: "node", format: "esm", write: false,
    plugins: [{ name: "vencord-runtime", setup(builder) {
        builder.onResolve({ filter: /^@utils\/types$/ }, () => ({ path: "types", namespace: "mock" }));
        builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: "export default plugin=>plugin;" }));
    } }]
});
const { default: plugin } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
const canonical = match => new RegExp(match.source.replaceAll(/\\i/g, "(?:[A-Za-z_$][\\w$]*)"), match.flags);

// Synthetic fixture models the relevant hook/props without distributing
// Discord's proprietary bundled source.
const fixture = `const definition={name:"2026-10-guild-tooltip-lazy-content"};
function details(location){let eager=experiment.useConfig({location:location}).enabled,[open,setOpen]=react.useState(!1),[timer]=react.useState(()=>new timers.Timer);return react.useEffect(()=>()=>timer.stop(),[timer]),{isOpen:open,shouldRenderRichContent:!eager||open,handleTooltipShow:react.useCallback(()=>{timer.stop(),setOpen(!0)},[timer]),handleTooltipHide:react.useCallback(()=>{timer.start(300,()=>setOpen(!1))},[timer])}}
function serverTooltip(props){let{guild:server}=props,text=server.name;return(0,jsx.jsx)(Tooltip.Component,{__unsupportedReactNodeAsText:text,hideOnClick:!0})}`;

function applyPatches(source) {
    assert.ok(source.includes(plugin.patches[0].find));
    for (const replacement of plugin.patches[0].replacement) {
        const match = canonical(replacement.match);
        assert.equal([...source.matchAll(new RegExp(match.source, "g"))].length, 1, String(replacement.match));
        source = source.replace(match, replacement.replace);
    }
    return source;
}

function hookHarness(source) {
    const file = ts.createSourceFile("rail.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let hook;
    function visit(node) {
        if (ts.isFunctionDeclaration(node) && node.body?.getText(file).includes("shouldRenderRichContent:") && node.body.getText(file).includes(".useConfig(")) hook = node;
        ts.forEachChild(node, visit);
    }
    visit(file);
    assert.ok(hook);
    const code = hook.getText(file);
    const experiment = code.match(/(\w+)\.useConfig/)[1];
    const react = code.match(/(\w+)\.useState/)[1];
    const [, timerModule, timerName] = code.match(/new (\w+)\.(\w+)/);
    const slots = [];
    let cursor = 0;
    let timer;
    class Timer {
        constructor() { timer = this; }
        stop() { this.callback = undefined; }
        start(delay, callback) { this.delay = delay; this.callback = callback; }
    }
    const React = {
        useState(initial) {
            const index = cursor++;
            if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
            return [slots[index], value => { slots[index] = value; }];
        },
        useEffect() {},
        useCallback: value => value
    };
    const renderHook = new Function(react, experiment, timerModule, `${code};return ${hook.name.text};`)(React, { useConfig: () => ({ enabled: false }) }, { [timerName]: Timer });
    return { render(location = "GuildTooltip") { cursor = 0;return renderHook(location); }, get timer() { return timer; } };
}

test("standalone plugin enables without BetterBetterFolders dependencies", () => {
    assert.equal(plugin.name, "SmoothServerList");
    assert.equal(plugin.enabledByDefault, true);
    assert.equal(plugin.dependencies, undefined);
});
test("patches match the synthetic module and preserve valid syntax", () => {
    new Function(applyPatches(fixture));
});
test("closed rich content stays unmounted and opens on hover", () => {
    const harness = hookHarness(applyPatches(fixture));
    const closed = harness.render();
    assert.equal(closed.shouldRenderRichContent, false);
    closed.handleTooltipShow();
    assert.equal(harness.render().isOpen, true);
    assert.equal(harness.render().shouldRenderRichContent, true);
});
test("hide releases rich content after the native grace period", () => {
    const harness = hookHarness(applyPatches(fixture));
    harness.render().handleTooltipShow();
    harness.render().handleTooltipHide();
    assert.equal(harness.timer.delay, 300);
    assert.equal(harness.render().shouldRenderRichContent, true);
    harness.timer.callback();
    assert.equal(harness.render().shouldRenderRichContent, false);
});
test("reopening cancels pending hide cleanup", () => {
    const harness = hookHarness(applyPatches(fixture));
    harness.render().handleTooltipShow();
    const open = harness.render();
    open.handleTooltipHide();open.handleTooltipShow();
    assert.equal(harness.timer.callback, undefined);
    assert.equal(harness.render().shouldRenderRichContent, true);
});
test("shared DM tooltips use the same on-demand content lifecycle", () => {
    const harness = hookHarness(applyPatches(fixture));
    const state = harness.render("DirectMessageTooltip");
    assert.equal(state.shouldRenderRichContent, false);
    state.handleTooltipShow();
    assert.equal(harness.render("DirectMessageTooltip").shouldRenderRichContent, true);
});
test("server tooltip props receive 200ms delay and retain accessible text", () => {
    const patched = applyPatches(fixture);
    const tooltip = new Function("jsx", "Tooltip", `${patched};return serverTooltip;`)({ jsx: (_, props) => props }, { Component: "tooltip" });
    const props = tooltip({ guild: { name: "Example server" } });
    assert.equal(props.delay, 200);
    assert.equal(props.__unsupportedReactNodeAsText, "Example server");
    assert.equal(props.hideOnClick, true);
});

if (process.env.DISCORD_GUILDS_MODULE) {
    test("patches match, compile and preserve open/close behavior on the current Discord module", async () => {
        const original = await readFile(process.env.DISCORD_GUILDS_MODULE, "utf8");
        const patched = applyPatches(original);
        new Function(`return ({${patched}})`);
        const harness = hookHarness(`({${patched}})`);
        assert.equal(harness.render().shouldRenderRichContent, false);
        harness.render().handleTooltipShow();
        assert.equal(harness.render().shouldRenderRichContent, true);
        harness.render().handleTooltipHide();harness.timer.callback();
        assert.equal(harness.render().shouldRenderRichContent, false);
    });
}

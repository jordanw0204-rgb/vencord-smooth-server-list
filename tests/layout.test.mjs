/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import ts from "typescript";

const built = await build({ entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", write: false, plugins: [{ name: "runtime", setup(b) {
    b.onResolve({ filter: /^@utils\/types$/ }, () => ({ path: "types", namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: "export default p=>p;" }));
} }] });
const { default: plugin } = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
const offsetPatch = plugin.patches.find(p => p.find === "topOffsetsBySurface").replacement;
const layerPatch = plugin.patches.find(p => p.find === "stopTrackingTargetPosition").replacement;
function apply(source, patch) {
    const match = new RegExp(patch.match.source.replaceAll(/\\i/g, "(?:[A-Za-z_$][\\w$]*)"), patch.match.flags);
    assert.equal([...source.matchAll(new RegExp(match.source, "g"))].length, 1, String(match));
    return source.replace(match, patch.replace);
}
const offsetFixture = "function setOffset(surface,id,value){store.setState(state=>{let offsets=new Map(state.topOffsetsBySurface.get(surface));null==value?offsets.delete(id):offsets.set(id,value);let surfaces=new Map(state.topOffsetsBySurface);return surfaces.set(surface,offsets),{topOffsetsBySurface:surfaces}})}";
function offsetHarness(source = apply(offsetFixture, offsetPatch), storeName = "store", functionName = "setOffset") {
    const store = { state: { topOffsetsBySurface: new Map() }, notifications: 0, setState(update) { const next = update(this.state); if (!Object.is(next, this.state)) { this.state = { ...this.state, ...next }; this.notifications++; } } };
    const set = new Function(storeName, source + ";return " + functionName)(store);
    return { store, set };
}
test("identical resize offsets preserve state identity and do not notify again", () => {
    const h = offsetHarness(); h.set("app", "header", 42); const { state } = h.store;
    h.set("app", "header", 42);
    assert.equal(h.store.state, state); assert.equal(h.store.notifications, 1);
});
test("removing a missing offset does not notify", () => {
    const h = offsetHarness(); const { state } = h.store;
    h.set("app", "missing", null); h.set("app", "missing", undefined);
    assert.equal(h.store.state, state); assert.equal(h.store.notifications, 0);
});
test("changed offsets, zero values, and actual removals still notify", () => {
    const h = offsetHarness();
    h.set("app", "header", 0); h.set("app", "header", 40); h.set("app", "header", null);
    assert.equal(h.store.notifications, 3); assert.equal(h.store.state.topOffsetsBySurface.get("app").has("header"), false);
});
test("one surface's update preserves unrelated surfaces and entries", () => {
    const h = offsetHarness(); h.set("app", "a", 10); h.set("app", "b", 20); h.set("popout", "a", 30);
    const other = h.store.state.topOffsetsBySurface.get("popout"); h.set("app", "a", 50);
    assert.equal(h.store.state.topOffsetsBySurface.get("popout"), other);
    assert.equal(h.store.state.topOffsetsBySurface.get("app").get("b"), 20);
});
test("10,000 repeated measurements notify once instead of 10,000 times", () => {
    const legacy = offsetHarness(offsetFixture); const fixed = offsetHarness();
    for (let i = 0; i < 10000; i++) { legacy.set("app", "header", 42); fixed.set("app", "header", 42); }
    assert.equal(legacy.store.notifications, 10000); assert.equal(fixed.store.notifications, 1);
});
const layerFixture = "function signature(p){return p.position}function getRect(p){return p.overrideTargetRect??p.targetRef.current.getBoundingClientRect()}class Layer{constructor(props){this.props=props;this.state={position:props.position};this.updates=0}updatePosition(){this.updates++}componentDidUpdate(previous,state){var next;let oldRect,newRect;(signature(previous)!==signature(this.props)||(next=this.props,oldRect=getRect(previous),newRect=getRect(next),oldRect.top!==newRect.top||oldRect.left!==newRect.left))&&this.updatePosition(),state.position!==this.state.position&&this.props.onPositionChange?.(this.state.position)}}return Layer;";
function layerHarness(fixed = true) {
    const source = fixed ? apply(layerFixture, layerPatch) : layerFixture;
    const Layer = new Function(source)(); let reads = 0;
    const target = { getBoundingClientRect() { reads++; return { top: 10, left: 20 }; } };
    const props = { position: "right", targetRef: { current: target } };
    const layer = new Layer(props);
    return { layer, props, get reads() { return reads; } };
}
test("stable targets avoid both redundant rectangle reads", () => {
    const legacy = layerHarness(false), fixed = layerHarness();
    legacy.layer.componentDidUpdate(legacy.props, legacy.layer.state); fixed.layer.componentDidUpdate(fixed.props, fixed.layer.state);
    assert.equal(legacy.reads, 2); assert.equal(fixed.reads, 0); assert.equal(fixed.layer.updates, 0);
});
test("changing reference objects that still point to the same DOM target stays cheap", () => {
    const h = layerHarness(); h.layer.props = { ...h.props, targetRef: { current: h.props.targetRef.current } };
    h.layer.componentDidUpdate(h.props, h.layer.state); assert.equal(h.reads, 0); assert.equal(h.layer.updates, 0);
});
test("real positioning prop changes still update", () => {
    const h = layerHarness(); h.layer.props = { ...h.props, position: "bottom" };
    h.layer.componentDidUpdate(h.props, h.layer.state); assert.equal(h.layer.updates, 1);
});
test("a different DOM target still compares its position and updates", () => {
    const h = layerHarness(); h.layer.props = { ...h.props, targetRef: { current: { getBoundingClientRect() { return { top: 99, left: 20 }; } } } };
    h.layer.componentDidUpdate(h.props, h.layer.state); assert.equal(h.reads, 1); assert.equal(h.layer.updates, 1);
});
test("changed override rectangles and position-change callbacks still work", () => {
    const h = layerHarness(); const calls = [];
    const previous = { ...h.props, overrideTargetRect: { top: 10, left: 20 } };
    h.layer.props = { ...previous, overrideTargetRect: { top: 99, left: 20 }, onPositionChange: value => calls.push(value) };
    h.layer.state.position = "left";
    h.layer.componentDidUpdate(previous, { position: "right" });
    assert.equal(h.layer.updates, 1); assert.deepEqual(calls, ["left"]); assert.equal(h.reads, 0);
});
test("layout patches match and compile against current captured Discord modules", { skip: !process.env.DISCORD_LAYOUT_FIXTURE_DIR }, async () => {
    const folder = process.env.DISCORD_LAYOUT_FIXTURE_DIR;
    const offsets = apply(await readFile(join(folder, "current-offsets.module.js"), "utf8"), offsetPatch);
    const layer = apply(await readFile(join(folder, "current-position-layer.module.js"), "utf8"), layerPatch);
    assert.doesNotThrow(() => new Function("return({" + offsets + "})"));
    assert.doesNotThrow(() => new Function("return({" + layer + "})"));
    const tree = ts.createSourceFile("offsets.js", "({" + offsets + "})", ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let setter;
    function visit(node) { if (ts.isFunctionDeclaration(node) && node.getText(tree).includes(".setState(")) setter = node; ts.forEachChild(node, visit); }
    visit(tree); assert.ok(setter);
    const h = offsetHarness(setter.getText(tree), "r", setter.name.text);
    h.set("app", "header", 42); h.set("app", "header", 42); assert.equal(h.store.notifications, 1);
});

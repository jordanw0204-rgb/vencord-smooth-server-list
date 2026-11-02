/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

export default definePlugin({
    name: "SmoothServerList",
    description: "Loads rich tooltip details on demand and delays server hover tooltips to reduce work while scrolling the server list.",
    authors: [{ name: "Jordan", id: 932850077888839690n }],
    tags: ["Utility", "Servers"],
    enabledByDefault: true,
    patches: [
        {
            find: 'name:"2026-10-guild-tooltip-lazy-content"',
            replacement: [
                {
                    // Hidden accessibility descriptions otherwise mount all the
                    // rich tooltip's presence/voice/activity subscribers too.
                    match: /shouldRenderRichContent:!\i\|\|(\i)/,
                    replace: "shouldRenderRichContent:$1"
                },
                {
                    // A wheel scroll moves many icons under a stationary
                    // pointer. Avoid opening a fresh floating layer for each.
                    match: /(function \i\(\i\)\{let\{guild:.{0,1800}?return\(0,\i\.jsx\)\(\i\.\i,\{)(?=__unsupportedReactNodeAsText:)/,
                    replace: "$1delay:200,"
                }
            ]
        }
    ]
});

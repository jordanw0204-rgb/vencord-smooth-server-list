/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

export default definePlugin({
    name: "SmoothServerList",
    description: "Reduces tooltip, layout, and repeated state-update work while scrolling server and channel lists.",
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
        },
        {
            find: "topOffsetsBySurface",
            replacement: {
                // ResizeObserver can report the same bottom offset repeatedly.
                // Returning the existing state avoids notifying every subscriber.
                match: /(\i\.setState\((\i)=>\{)(?=let (\i)=new Map\(\2\.topOffsetsBySurface\.get\((\i)\)\);null==(\i)\?\3\.delete\((\i)\):\3\.set\(\6,\5\);)/,
                replace: "$1if($5==null?!$2.topOffsetsBySurface.get($4)?.has($6):$2.topOffsetsBySurface.get($4)?.get($6)===$5)return $2;"
            }
        },
        {
            find: "stopTrackingTargetPosition",
            replacement: {
                // Comparing old/new props that reference the same DOM target
                // reads its current rectangle twice, often flushing layout just
                // after the layer wrote its position. Those rectangles are equal.
                // Real prop/target changes and native resize tracking still run.
                match: /((\i)\((\i)\)!==\2\(this\.props\)\|\|)(\((\i)=this\.props,(\i)=(\i)\(\3\),(\i)=\7\(\5\),\6\.top!==\8\.top\|\|\6\.left!==\8\.left\))/,
                replace: "$1(($3.targetRef?.current!==this.props.targetRef?.current||$3.overrideTargetRect!==this.props.overrideTargetRect)&&$4)"
            }
        }
    ]
});

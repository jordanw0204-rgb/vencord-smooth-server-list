# SmoothServerList

A standalone Vencord userplugin that reduces tooltip work around the server
list. It works with Discord's normal server rail and with folder plugins.

- Rich server and DM tooltip details load while the tooltip is open.
- Server tooltips wait 200 ms before opening, so moving past icons while
  scrolling does not immediately open a tooltip for each server.
- Closed tooltips keep Discord's plain-text accessibility descriptions.

This is a targeted rendering optimization. It does not promise a particular
frame rate or address every possible cause of Discord lag.

## Install

From the root of a Vencord source checkout:

```sh
git clone https://github.com/jordanw0204-rgb/vencord-smooth-server-list.git src/userplugins/SmoothServerList
pnpm build
```

Fully restart Discord. The plugin is enabled by default; use Vencord's plugin
settings to disable it and restart if you want to compare behavior.

This repository is private, so cloning requires access to it. See Vencord's
[custom plugin guide](https://docs.vencord.dev/installing/custom-plugins/) for
the source-build and injection workflow.

## Development

Requires Node.js 20 or newer. Inside this plugin directory:

```sh
npm install
npm test
```

To validate the patches against a locally captured Discord guild-bar module,
set `DISCORD_GUILDS_MODULE` to that file's absolute path before running `npm test`.
The captured Discord source is read locally and is not included in this repo.

Discord's internal modules change over time. The regression tests check both
patch matching and the tooltip open/close lifecycle. After changes, also run
the containing Vencord checkout's lint and desktop/web builds.

Licensed under GPL-3.0-or-later, consistent with Vencord.

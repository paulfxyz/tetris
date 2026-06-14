# Contributing to tetris

Thanks for stopping by. This is a hobby project but PRs are welcome.

## Ground rules

- **No frontend dependencies.** The whole point is that this is a zero-build, vanilla-JS game. Don't add React, Vite, Webpack, Tailwind, etc. CDN scripts in `index.html` are only acceptable if they're tiny, optional, and there's no reasonable alternative.
- **Pure functions where you can.** `engine.js` has zero DOM access. Keep it that way.
- **One screen, one canvas.** The board, hold, and next previews are all `<canvas>`. The HUD is HTML.

## Running locally

```bash
git clone https://github.com/paulfxyz/tetris.git
cd tetris/public
python3 -m http.server 8000
# open http://localhost:8000
```

For the scoreboard backend, see [INSTALL.md](INSTALL.md).

## Testing the engine

The engine is plain ES modules and can be imported from Node:

```bash
node --input-type=module -e "
  import('./public/js/engine.js').then(({ Engine }) => {
    const e = new Engine();
    console.log(e.current.type, e.queue);
  });
"
```

## Pull request checklist

- [ ] Game still loads from `file://` and a plain static server.
- [ ] No new frontend dependencies.
- [ ] All three themes still look good (Classic / Color / Modern, both light and dark).
- [ ] Mobile (≤ 760px viewport, touch) still works.
- [ ] No regressions in the offline service worker — bump the `CACHE` version in `public/sw.js` if you change cached assets.
- [ ] If you touch the engine, run the test snippets in this file.

## Reporting bugs

Please include:
- Browser + OS.
- Theme + mode.
- A small reproduction (key sequence, screenshot, or short video).
- Console errors if any.

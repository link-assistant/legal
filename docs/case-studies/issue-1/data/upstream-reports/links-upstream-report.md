The published links-notation@0.27.0 module imports EventEmitter from the Node built-in 'events' in dist/index.js (around line 3076). A browser build with esbuild@0.28.2 and platform=browser fails with "Could not resolve events". The same import is reached transitively by lino-objects-codec.

Minimal reproduction:

1. npm install links-notation@0.27.0 esbuild@0.28.2
2. Create entry.js containing `import {Parser} from 'links-notation'; console.log(new Parser().parse('(law: text)'));`
3. Run `npx esbuild entry.js --bundle --platform=browser --outfile=bundle.js`.

Expected: a browser-compatible parser bundle, or a documented browser dependency/entry point.

Workaround verified downstream: install events@3.3.0 explicitly. Our actual browser integration and LiNo download tests then pass in Chromium: https://github.com/link-assistant/legal/pull/2.

Please consider removing the built-in dependency from the parser-only entry point, providing a browser export, or declaring/documenting the compatible browser polyfill.

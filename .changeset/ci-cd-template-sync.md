---
'@link-assistant/legal': patch
---

Sync CI/CD with the JavaScript and Python pipeline templates so main runs stop failing silently or for the wrong reason. The preview workflow no longer reports false drift, and the Dependency Review and release preflight jobs name the maintainer action that is missing. The published package no longer pulls the deprecated `whatwg-encoding` through cheerio (`encoding-sniffer` 1.0.2 override). The `prepack` bootstrap now prints to stderr so `npm pack --json` output stays machine-readable.

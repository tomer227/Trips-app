# Source

Installed from https://github.com/sliday/google-fonts-skill (MIT, © 2026 Stas Kulesh), version 1.4.1.

Copied: SKILL.md, LICENSE, data/, references/, showcase/showcase.json,
scripts/{core,search,generate-css}.py and src/google_fonts_mcp/{__init__,core}.py.

Deliberately not copied: the maintainer tooling (scripts/fetch-and-enrich.py and
scripts/generate-og-images.py make network calls), the MCP server, tests, and the
showcase website. `scripts/generate-showcase.py` mentioned in SKILL.md is therefore not available.

The copied scripts were read before installing: they use no network, subprocess or file writes.

# Notices

Codex Dream Skin Studio is an **unofficial** customization project and is **not affiliated with, endorsed by, or sponsored by OpenAI**.

## Software license

The MIT License in `LICENSE` applies to the **software source code** in this repository (scripts, CSS, injectors, docs that describe the software, and the abstract demo asset generated for this repo).

It does **not** grant rights to:

- OpenAI or Codex trademarks, product names, logos, or trade dress
- Official Codex / ChatGPT application binaries, `.app` bundles, or `app.asar`
- Any user-supplied images or third-party artwork you drop into a theme
- Character likenesses, franchise art, or celebrity imagery

## Demo artwork

`assets/portal-hero.png` is original abstract geometric art generated for this open-source repository (no characters). Replace it with your own image before shipping a branded theme to customers.

## Gothic Void Crusade

`presets/preset-gothic-void-crusade/background.jpg` was created and contributed
by [seansong-ideogram](https://github.com/seansong-ideogram) through pull request
[#134](https://github.com/Fei-Away/Codex-Dream-Skin/pull/134) for inclusion in
this MIT-licensed project. It is the redistributable default artwork included in
the public macOS and Windows installers. Its name and artwork do not imply
OpenAI/Codex affiliation or endorsement.

## Arina Hashimoto reference material

The following user/maintainer-supplied files are excluded from the MIT software license:

- `presets/preset-arina-hashimoto/background.jpg`
- `../windows/assets/dream-reference.jpg`
- `../docs/images/presets/arina-hashimoto-source.png`
- `../docs/images/presets/arina-hashimoto-light.jpg`
- `../docs/images/presets/arina-hashimoto-dark.jpg`

They are included in the source repository at the maintainer's direction as a
local reference preset, source archive, and real runtime previews. They are
excluded from the public v1.3+ DMG and Setup.exe assets. They are not official
OpenAI/Codex artwork. The preset name is a maintainer label and does not imply
the named person's participation, approval, or endorsement. Their repository
inclusion does not certify or grant third-party likeness, model-output, or
redistribution rights. Downstream redistribution and commercial use require an
independent rights review; the two runtime screenshots are documentation
previews and must never be imported as wallpapers.

## Runtime

### okkskin Node Inspector pulse

The macOS Node Inspector pulse transport is adapted from the implementation in
[okkskin](https://github.com/fanbidog/okkskin), version 0.2.2 / commit
`f2835e37f4d7f048f9270d62b67f71eb750e7fe1`.

MIT License

Copyright (c) 2026 OkkMax

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

- The macOS package does not redistribute Node.js. It validates and uses the
  Node.js executable already signed and bundled inside the user's official
  Codex desktop application.
- The Windows Setup.exe redistributes only `node.exe` and `LICENSE` from the
  pinned official Node.js v22.23.1 win-x64 archive after verifying its published
  SHA-256. Node.js is distributed under its own license; that license is kept
  beside the bundled executable in `runtime/node/LICENSE`.

## Inno Setup Simplified Chinese messages

The Windows installer is compiled with Inno Setup. Its Simplified Chinese
messages file is vendored unchanged from the official Inno Setup source tag
`is-6_7_1` at
`windows/installer/languages/ChineseSimplified.isl`, maintained by Zhenghan
Yang and distributed under the Inno Setup License. The full license is retained
at `windows/installer/languages/Inno-Setup-License.txt`.

## Security model

macOS themes are applied through a short Node Inspector pulse on loopback
`9229`. The listener is accepted only when its PID matches the verified Codex
main process, and Inspector is closed immediately after use. The lightweight
PID watcher does not retain a debugging endpoint. Do not run untrusted local
software while an apply, verify, or restore pulse is in progress.

# 🌺 Tuhua Translator

🌐 **English** · [Español](README.es.md)

**A visual novel and game translator** — translate visual novels and games in real time, right on your screen.

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)
[![Electron](https://img.shields.io/badge/Electron-28-blue.svg)](https://www.electronjs.org/)
[![Version](https://img.shields.io/github/v/release/LycaDragen/Tuhua_Translator?color=emerald&label=version)](https://github.com/LycaDragen/Tuhua_Translator/releases/latest)

---

## 📖 What is Tuhua Translator?

Tuhua Translator is a free desktop app with public source code (licensed CC BY-NC 4.0, see [License](#-license)) that translates Japanese visual novels and games in real time. It overlays the translation directly on top of the game window — no patches, and no changes to the original game files.

### ✨ Main features

- **4 input methods**: Textractor, Clipboard, OCR and XUAT (XUnity.AutoTranslator)
- **7 translation engines**: Google Translate (free), Bing (free), DeepL, OpenAI (7 cloud providers through this one engine: OpenAI, OpenRouter, DeepSeek, Google Gemini, Anthropic, Groq, Custom), Local LLM, LibreTranslate and Custom MT
- **Transparent overlay**: translations drawn over the game window, plus an input overlay for typing text by hand
- **Custom glossary**: fixed translations for names and terms, with automatic character import from [VNDB](https://vndb.org/)
- **Translation memory**: a smart cache with fuzzy matching for repetitive dialogue
- **Per-game profiles**: each game gets its own glossary, translation settings and memory
- **8 interface languages**: Español, English, 日本語, 中文, Русский, Português, Italiano, Français
- **Full documentation** in the same 8 languages: [tuhua.lyca.dev](https://tuhua.lyca.dev/en/)
- **Dark/light theme**
- **Update checker**: tells you when a new version is out and installs it from inside the app (Windows/Linux), never downloading anything without your permission

---

## 🚀 Installation

### Direct download

Go to the [Releases](https://github.com/LycaDragen/Tuhua_Translator/releases) page and download the installer for your operating system:

| Platform | Format | Notes |
|---|---|---|
| Windows | `.exe` (NSIS) | Installer with a custom install directory option |
| Linux | `.AppImage` | Portable, no installation needed |
| macOS | `.dmg` | Apple Silicon only (M1/M2/M3/M4) — drag to Applications. **Untested**: the build is produced by CI but nobody has run it on a Mac yet |

The Windows and Linux builds are also available on [itch.io](https://lycaxdragen.itch.io/tuhua-translator), updated with every release.

> **The installers are not signed** (there's no developer certificate yet). Windows will show a SmartScreen warning ("More info" → "Run anyway"), and on macOS Gatekeeper will block the first launch (right-click → "Open"). This is expected — the source code is public, and you can review it in this very repo.

### Updates

Tuhua only tells you when there's a new version: it checks GitHub 30 seconds after launch and shows a notice in the **Settings** tab (the version number in the top bar also turns amber with a `↑`). **It never downloads or installs anything unless you click** — you can download it, read what changed, or skip that specific version.

- On **Windows and Linux**, downloading and installing both happen inside the app.
- On **macOS** it only notifies you and opens the download page: Apple requires a paid signing certificate to allow auto-updates.

You can also check manually, or turn the automatic check off, under **Settings → Advanced → Updates**.

> **If you're coming from a `3.13.x` version**: the updater won't offer you `1.0.1` or later, because `1.0.1` is a lower number than `3.13.120` (version numbering was reset to real semver, see [CHANGELOG.md](CHANGELOG.md)). Install the latest version by hand once, and from then on updates work by themselves.

### From source

The project uses [pnpm](https://pnpm.io/) (the repo's lockfile is `pnpm-lock.yaml`):

```bash
# Clone the repository
git clone https://github.com/LycaDragen/Tuhua_Translator.git
cd Tuhua_Translator

# Install dependencies
pnpm install

# Run in development mode
pnpm run dev

# Build for your platform
pnpm run build:win    # Windows
pnpm run build:linux  # Linux
pnpm run build:mac    # macOS (arm64, needs a real Mac or CI)
```

---

## 🎮 Input methods

Like every method, Tuhua always **opens paused**: press **▶ Active** to begin.

### 🪝 Textractor (Recommended)
Connects to [Textractor](https://github.com/Artikash/Textractor) to pull text straight out of the game's memory. Supports both a TCP connection and launching the bundled TextractorCLI.

- Extracts text from the game process's memory
- Support for custom hooks
- Automatic hook detection when launching games
- Fixed port (9251) for Manual TCP Mode — there is no field in the interface to change it

### 📋 Clipboard
Watches the system clipboard and automatically translates any text you copy. Ideal for games that let you copy their text.

- Only what you copy **after** turning the method on is translated: whatever was already on the clipboard when you activated it (or when you resume from a pause) is ignored on purpose. To translate that line, copy a new one

### 📸 OCR
Captures a region of the screen and reads the text from the image. Perfect for games Textractor can't handle.

- **Default engine: Tesseract.js** — runs with no extra downloads and without depending on an optional native binary (`onnxruntime-node`)
- **PaddleOCR (PP-OCRv5) available as an alternative engine** — a unified Chinese+Japanese model (kanji, kana, simplified and traditional text) plus a dedicated Korean model, running 100% locally through ONNX Runtime, with no Python and no internet connection after the first model download. Recommended for Japanese/Chinese/Korean, or when the scene has a lot of visual noise behind the text
- **Automatic language detection** (`auto`): with Tesseract it alternates between English, Japanese and Korean depending on the recognized text (it never activates the Chinese model); with PaddleOCR it uses the unified Chinese+Japanese model and only switches to the dedicated model if it detects Korean
- **Geometric furigana filtering** (PaddleOCR engine): automatically discards the small kana readings above kanji so they don't pollute the text being translated
- Vertical text (縦書き) support with automatic detection and rotation (PaddleOCR engine)
- Manual or automatic capture (configurable interval)

### 🎮 XUAT (XUnity.AutoTranslator)
Integrates with [XUnity.AutoTranslator](https://github.com/bbepis/XUnity.AutoTranslator) for Unity games. Tuhua acts as the translation server and XUAT replaces the text directly inside the game.

- Automatic BepInEx + XUAT installation
- Automatic backend detection (Mono/IL2CPP)
- The translated text appears inside the game, with no overlay
- Configurable port (default: 8419)
- Tuhua opens paused here too: the server starts when you press **▶ Active**

---

## 🔤 Translation engines

| Engine | Type | Needs an API key | Notes |
|---|---|---|---|
| 🌐 Google Translate | Free | No | Web scraping, no official limit |
| 🔍 Bing Translator | Free | No | Web scraping, no official limit |
| 💎 DeepL API | Official | Yes | High quality, supports formality |
| 🧠 OpenAI (cloud LLM) | Official | Yes | One engine, 7 selectable providers: OpenAI, OpenRouter, DeepSeek, Google Gemini, Anthropic, Groq, Custom |
| 🤖 Local LLM | Local | No | LM Studio, Ollama, llama.cpp or KoboldCpp, 100% offline |
| 🏠 LibreTranslate | Self-hosted | No | Open source, full privacy |
| ⚙️ Custom MT | Custom | Optional | Any compatible endpoint |

### DeepL: formality
With DeepL you can control how formal the translation is, which is ideal for Japanese (keigo/casual). It's a per-profile setting:
- Default
- Prefer formal
- Prefer informal

### Technical documentation

| Document | Contents |
|---|---|
| [`docs/en/translation-context-support.md`](docs/en/translation-context-support.md) | Which engine supports context and native glossaries, and what Tuhua implements for each |
| [`docs/en/llm-prompting.md`](docs/en/llm-prompting.md) | Prompt templates, available variables, the glossary as an instruction, the table of LLM providers and how to add a new one |

Both are also available in Spanish: [`docs/`](docs/).

---

## 📖 Glossary

The glossary lets you define custom translations for character names, game-specific terms and slang that translation engines don't handle well.

- Regular expression support
- Automatic character-name import from [VNDB](https://vndb.org/)
- Applied automatically before translation
- JSON import/export

---

## 💾 Translation memory

Translation memory stores pairs of previous translations and reuses them automatically. It uses fuzzy matching to spot similar lines, which is especially useful in visual novels with branching routes where the same dialogue repeats with small variations.

- Persistent cache per profile
- Fuzzy matching for similar lines
- Saves API calls and cuts latency
- Translation history with export

---

## ⌨️ Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+L` | Show/Hide the main window |
| `Ctrl+Shift+E` | Show/Hide the overlay |
| `Ctrl+Shift+M` | Turn click-through on/off |
| `Ctrl+Shift+R` | Re-translate the text already on screen, without capturing it again |
| `Ctrl+Shift+O` | Cycle the overlay opacity |
| `Ctrl+Shift+S` | Immediate OCR capture (only while OCR is active) |

---

## 🛠️ Technologies

- **[Electron](https://www.electronjs.org/)** — desktop application framework
- **[Tesseract.js](https://github.com/naptha/tesseract.js)** — default OCR engine (WebAssembly)
- **[PaddleOCR (PP-OCRv5)](https://github.com/PaddlePaddle/PaddleOCR)** via **[ONNX Runtime](https://github.com/microsoft/onnxruntime)** — alternative OCR, runs locally without Python
- **[electron-store](https://github.com/sindresorhus/electron-store)** — settings persistence
- **[Tailwind CSS](https://tailwindcss.com/)** — utility CSS framework (v3.4.17, bundled in `renderer/main/vendor/`; the interface doesn't need internet to render)

---

## 📁 Project structure

```
tuhua-translator/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.js             # Entry point
│   │   ├── ipc-handlers.js      # IPC handlers
│   │   ├── window-manager.js    # Window management
│   │   ├── tray.js              # System tray
│   │   └── shortcuts.js         # Global shortcuts
│   ├── preload/                 # Preload scripts (IPC security)
│   │   ├── main-preload.js
│   │   └── overlay-preload.js
│   └── services/                # Backend services
│       ├── clipboard-watcher.js
│       ├── ocr.js
│       ├── ocr-paddle.js
│       ├── textractor.js
│       ├── textractor-launcher.js
│       ├── xuat-server.js
│       ├── xuat-installer.js
│       ├── vndb.js              # Character import from VNDB
│       ├── game-engine-detect.js
│       ├── profiles/            # Per-game profiles
│       │   ├── profile-schema.js
│       │   ├── profile-store.js
│       │   └── profile-migrations.js
│       └── translation/
│           ├── pipeline.js      # Central orchestrator
│           ├── cache.js         # Persistent LRU cache
│           ├── translation-memory.js
│           ├── context-memory.js
│           ├── glossary-entries.js
│           ├── glossary-merge.js
│           ├── glossary-prompt.js
│           ├── deepl-glossary-sync.js
│           ├── llm-providers.js # The 7 providers of the OpenAI/LLM engine
│           ├── prompt-presets.js
│           └── engines/         # Translation engines
│               ├── google-free.js
│               ├── bing.js
│               ├── deepl.js
│               ├── openai.js
│               ├── local-llm.js
│               ├── libretranslate.js
│               └── custom-mt.js
├── renderer/
│   ├── main/                    # Main window
│   │   ├── index.html
│   │   ├── renderer.js
│   │   ├── i18n.js
│   │   └── assets/
│   ├── output-overlay/          # Translation overlay
│   ├── input-overlay/           # Overlay for manual text
│   ├── word-save-prompt/        # Quick save of terms to the glossary
│   └── capture-area/            # OCR capture area
├── package.json
├── LICENSE
└── .gitignore
```

---

## 🤝 Contributing

Contributions are welcome! If you'd like to contribute:

1. Fork the repository
2. Create a branch for your feature (`git checkout -b feature/new-feature`)
3. Commit your changes (`git commit -m 'Add new feature'`)
4. Push to the branch (`git push origin feature/new-feature`)
5. Open a Pull Request

### Reporting bugs

If you find a bug, open an [Issue](https://github.com/LycaDragen/Tuhua_Translator/issues) or
write to **help@tuhua.lyca.dev** — the latter if you don't have a GitHub account or would rather
not file the report in public. Either way, include:

- A description of the problem
- Steps to reproduce it
- Your operating system and Tuhua Translator version
- Logs. The interface has two buttons at the bottom right: **Logs** copies the last 100
  lines to the clipboard, and **Folder** opens the file explorer with `main.log` already
  selected so you can attach it whole — the latter is the one to use for a report. Full details
  (paths per system and rotation) at [tuhua.lyca.dev](https://tuhua.lyca.dev/en/referencia/reportar-bug/)

> In Clipboard mode the log includes the text you copied. Since v1.0.7, the credentials Tuhua
> recognizes (OpenAI, Anthropic, DeepL, Google… API keys) are masked before being written to
> the file, but it's still worth skimming before you send it: it's plain text.

---

## 📜 License

This project is licensed under **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)**.

That means you can:
- ✅ **Share** — copy and redistribute the material in any medium or format
- ✅ **Adapt** — remix, transform, and build upon the material

Under the following terms:
- 📝 **Attribution** — you must give appropriate credit to Lyca, provide a link to the license, and indicate if changes were made
- 🚫 **NonCommercial** — you may not use the material for commercial purposes

The source code is public, but because of the NonCommercial term this is a *source-available* license rather than an OSI-approved open source one. For details, see the [LICENSE](LICENSE) file or visit [creativecommons.org/licenses/by-nc/4.0](https://creativecommons.org/licenses/by-nc/4.0/).

---

## 👤 Author

**Lyca** — [help@tuhua.lyca.dev](mailto:help@tuhua.lyca.dev)

If you like this project, consider leaving a ⭐ on GitHub. Tuhua is free; if you'd like to support it, there's a discreet coffee icon in the app's top bar (or go straight to [ko-fi.com/lycadragen](https://ko-fi.com/lycadragen)) — it's entirely optional.

---

## 🙏 Acknowledgements

### Special thanks

- **Zpec** — for the unconditional support, for always being there, and for pushing me to grow and be better throughout this whole process.
- **Dust** — for gifting me the Claude Pro key that made it possible to take this project as far as I always wanted it to go.

### Technologies and open source projects

- [Textractor](https://github.com/Artikash/Textractor) — text extractor for games
- [XUnity.AutoTranslator](https://github.com/bbepis/XUnity.AutoTranslator) — translation plugin for Unity
- [Tesseract.js](https://github.com/naptha/tesseract.js) — default OCR engine (WebAssembly)
- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) (PaddlePaddle) — alternative OCR (PP-OCRv5)
- [DeepL](https://www.deepl.com/) — high-quality translation engine
- [Electron](https://www.electronjs.org/) — desktop application framework

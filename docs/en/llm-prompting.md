# Prompting in the LLM engines

🌐 **English** · [Español](../llm-prompting.md)

How Tuhua builds the prompt it sends to an LLM engine (OpenAI, OpenRouter,
DeepSeek, Google Gemini, Anthropic, Groq, or a local OpenAI-compatible
server such as LM Studio/Ollama/llama.cpp/KoboldCpp), which variables are
available, how the glossary works for these engines, and how to add a new
cloud provider. See also
[`translation-context-support.md`](translation-context-support.md) for the
comparison of what each translation engine supports, LLM or not.

## Prompt template

The `system prompt` is a text template with variables (the global
`promptTemplate` setting). Before this, writing a custom prompt
**replaced** the entire default prompt — silently losing the language names
and the few-shot examples. Now it is additive: any variable that isn't used
simply doesn't appear.

### Available variables

| Variable | What it resolves to | Can be left empty |
|---|---|---|
| `{sentence}` | The line to translate | No |
| `{srclang}` / `{tgtlang}` | Full name of the source/target language | No |
| `{srclangcode}` / `{tgtlangcode}` | Language code (`ja`, `es`, ...) | No |
| `{inputMethod}` | Where the text comes from (Textractor, Clipboard, OCR, XUAT) | No, once resolved by the pipeline |
| `{contextBoth}` / `{contextBoth[N]}` | Previous lines as `source → translation` | Yes |
| `{contextOriginal}` / `{contextOriginal[N]}` | Only the source side of the previous lines | Yes |
| `{contextTranslation}` / `{contextTranslation[N]}` | Only the translated side of the previous lines | Yes |
| `{glossary}` | Glossary instruction block (see below) | Yes |
| `{game}` | Name of the active profile | Yes |
| `{vnTitle}` | The VN's title according to its VNDB entry in the profile | Yes |
| `{speaker}` | The speaker's name, if it could be extracted from the line | Yes |
| `{ocrNote}` | Extra note when the text comes from OCR | Yes |

The `[N]` suffix on the three context variables limits them to the N most
recent lines (`{contextBoth[3]}` = the last 3 lines, not the 3 oldest —
context is stored from oldest to newest).

**Collapse rule**: if ALL the variables on a template line are ones that
can be left empty, and all of them resolve to empty, the entire line
disappears — including the literal text around them. That way
`- Title: {vnTitle}` with an empty `vnTitle` doesn't leave a dangling
`- Title:`. An unknown variable (a typo) is NOT silently removed: it is
left literal in the text and reported as a warning — this is the direct
safeguard against the real bug that motivated this system (`{TEXT}`
travelling unresolved to the model).

If the template uses `{sentence}` anywhere, the text to translate travels
there and no separate chat turn is added — nor are the few-shot examples
(see below), even if they are enabled: adding them would leave the
conversation ending on an `assistant` turn with no final `user` turn
asking the model for anything, which in practice produces an empty
response instead of an error. If the template does not use `{sentence}`
(the case for the 4 factory presets), the text travels as the last `user`
turn, after the system prompt and the few-shot examples if they are
enabled — the same behavior the app had before this template system
existed.

### Factory presets

Four presets share the same base structure and differ only in translation
tone (rules 5 and 7 of the template):

| Preset | Focus |
|---|---|
| **Balanced** (default) | Translation by meaning, natural in the target language |
| **Literal** | Prioritizes fidelity to the original's structure and word choice |
| **Localized** | Adapts idioms, jokes and cultural references so they work in the target language |
| **Uncensored** | Same as Balanced, but with the explicit-content rule reinforced above any moderation instinct of the model |

Editing the template by hand ("Advanced" section in Settings) desyncs the
preset selector — the `<select>` only marks a preset as active if the
saved text is byte-identical to that preset's text.

### Few-shot examples

Independent of the template — the `llmFewShot` setting (enabled by
default), except when the template uses `{sentence}` (see above): then
they are always omitted, regardless of the setting.
It adds 2 example turns per supported language pair (`ja→es`, `ja→en`,
`zh→es`, `ko→en`, `en→es`) before the text to translate, chosen to teach
honorifics and the translation of fragments. A pair not covered by the
table simply adds no examples — it is not an error.

## Glossary as a prompt instruction

The global `glossaryMode` setting, with three values:

| Mode | What it does |
|---|---|
| `literal` | Pre-overhaul behavior: text substitution before sending to the engine, with no prompt instruction. Valid for any engine |
| `prompt` | Prompt instruction only (the `{glossary}` block) — lets the model apply the rendering guided by the instruction, with no prior literal substitution |
| `hybrid` **(default)** | Literal substitution for the rendering terms (`source≠target`) **plus** the prompt instruction |

`hybrid`/`prompt` only apply to engines with `capabilities.glossaryPrompt`
(today: all the LLMs listed above). Any engine without that capability
(DeepL, Google Translate, LibreTranslate, Custom MT) always uses `literal`
regardless of the setting — they have no way of receiving a prompt
instruction.

### Why `hybrid` is the default, not `prompt`

Measured against two real engines before deciding: with OpenAI, the prompt
instruction alone reaches 100% compliance. With a local 3B model
(Qwen2.5-3B-Instruct via Ollama), only 81.8% — it ties with `literal`, it
doesn't beat it. A single global setting can't assume how capable each
user's local model is, so the default doesn't depend on an instruction
that a small model can ignore.

### "Do not translate" terms — the placeholder mechanism

For a glossary entry where `source === target` (the typical case of a VNDB
import: proper names that must stay exactly the same), literal
substitution is a no-op by definition — replacing `桜花学園` with `桜花学園`
changes nothing, so the model still sees the term in Japanese and can
translate it anyway, no matter what the prompt instruction says.

That's why these terms are masked BEFORE the text is sent to the engine:
each occurrence is replaced by an opaque token (`⟦N⟧`), and restored to
the real term after the response. The model never gets to see the original
term, so it doesn't depend on it obeying any instruction. It includes a
spacing fix (any letter/digit boundary except CJK↔CJK) for the case where
the model glues the token to the neighboring text with no space.

This only covers exact or case-insensitive entries with
`source===target` — `regex`-type entries are left out of the masking (same
criterion as the prompt instruction block), and rendering entries
(`source≠target`) have no protection of this kind: they depend on literal
substitution (in `hybrid` mode) plus the instruction.

## Data contract that reaches the engine

Besides the text and the template variables, each call to an LLM engine
includes:

- **`speaker`**: extracted from the raw line before the cleaning filters
  (quotes, markup tags) destroy it. Two forms are detected:
  `<Name>dialogue` and `Name「dialogue」`.
- **`game`** / **`vnTitle`** / **`inputMethod`**: resolved from the active
  profile and the current input configuration, without the user having to
  type anything.

These four pieces of data are what populate `{speaker}`/`{game}`/`{vnTitle}`/
`{inputMethod}` in the template — before this, they always resolved empty
(a gap documented as transitional at the time).

## Output sanitization

Before a model response reaches the cache/translation memory/screen, it
goes through a sanitizer (`llmSanitize`, enabled by default) that detects
and handles, in order: empty output, cut-off by token limit (`truncated` —
not cached), reasoning blocks (`<think>`) from models such as
DeepSeek-R1/QwQ, markdown fences, a preamble like "Here is the
translation:", wrapping quotes added by the model, **model refusal** (two
combined signals: a known refusal phrase + disproportionate length or the
wrong script for the target language), untranslated passthrough, and
translator's notes in a separate paragraph. A refusal or a passthrough is
never saved to the cache/TM/context — the pipeline falls back to the
fallback engine instead.

## Cloud provider table

The providers in the table (`src/services/translation/llm-providers.js`)
share a single adapter (`llm-base.js`) because they all speak the same
OpenAI-compatible `/chat/completions` format — adding a new one is a row of
data, not a new class.

| Provider | Requires a key | Notes |
|---|---|---|
| OpenAI | Yes | Reasoning models (`o*`) use `max_completion_tokens` instead of `max_tokens` and don't accept custom temperature/top_p |
| OpenRouter | Yes | A single key reaches models from OpenAI/Anthropic/Google/DeepSeek/Meta and more |
| DeepSeek | Yes | `deepseek-reasoner` doesn't accept temperature/top_p, but does accept `max_tokens` (unlike OpenAI's reasoning models) |
| Google Gemini | Yes | Via its OpenAI compatibility layer |
| Anthropic | Yes | Marked beta in the UI — its OpenAI compatibility layer is beta according to Anthropic's own documentation. **That layer only covers `/chat/completions`**: `GET /v1/models` (what "Validate" queries) is a native endpoint and requires the `anthropic-version` header, which arrives via `extraHeaders` |
| Groq | Yes | Focused on inference speed |
| Custom | Optional | Escape hatch for any OpenAI-compatible endpoint not listed |

Local server (the `local-llm` engine, no key): port presets for LM
Studio (`:1234`), Ollama (`:11434`), llama.cpp (`:8080`) and KoboldCpp
(`:5001`), or a custom URL.

### How to add a new cloud provider

**Extra header:** if the provider requires any header beyond `Content-Type`
and the `Authorization: Bearer`, it is declared as `extraHeaders` in its
row — `getExtraHeaders()` resolves it for the request and for "Validate".
It is the same criterion as `getRequestParamOverrides()`: a provider quirk
is a piece of data in the table, not an `if` at the call site.

1. Add an entry to the `CLOUD_PROVIDERS` array in
   `src/services/translation/llm-providers.js`: `id`, `labelKey` (i18n
   key), `displayName` (English name for logs, not translated),
   `baseUrl` (**without** a trailing `/` — `llm-base.js` concatenates
   directly), `authScheme`, `requiresKey`, `defaultModel`, `models` (list
   for the model's `<datalist>`), `maxTokensField`, `supportsTopP`,
   `docsUrl`.
2. If the provider has a reasoning model that rejects
   temperature/top_p and/or requires `max_completion_tokens` instead of
   `max_tokens`: add `reasoningModelPattern` (a regex against the model
   name) and, only if it applies, `reasoningModelUsesMaxCompletionTokens:
   true`. Neither flag is inferred from the other — they are per
   provider, not a generic "reasoning model" behavior.
3. Add the `labelKey` key to the 8 locales of `renderer/main/i18n.js`.
4. Run `node scripts/test-llm-providers.js` — the bench validates, among
   other things, that no `baseUrl` ends in `/` (a direct safeguard
   against the double-slash bug found with Google Gemini/Anthropic).

There is no need to touch `llm-base.js`, `openai.js` or `local-llm.js` —
none of them know which providers exist, they only read the table.

## See also

- [`translation-context-support.md`](translation-context-support.md) —
  native context and glossary compared across all of Tuhua's translation
  engines, LLM and non-LLM.

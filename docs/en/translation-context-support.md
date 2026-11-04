# Native context and glossary support per engine

🌐 **English** · [Español](../translation-context-support.md)

Research from August 2026 into which translation engines accept context
and glossaries natively, done for the rewrite of the LLM engines. It has
an expiry date (APIs change), so it lives versioned in the repo.

## What "native context" and "native glossary" mean here

- **Native context**: the engine accepts the previous lines of dialogue as
  its own structured data (not as text pasted by hand at the start of the
  sentence), and uses them to disambiguate without translating them or
  billing them as if they were part of the text to translate.
- **Native glossary**: the engine has its own mechanism (not a prompt
  trick) to force a term to always be translated the same way, or left
  untranslated.

## Comparison table

| Engine | Native context | Native glossary | Notes |
|---|---|---|---|
| **DeepL** | ✅ `context` — GA since Q2 2024, **not billed**, no character limit of its own (the only real cap is the 128 KiB body) | ✅ `glossary_id` (one id per request; DeepL also documents a plural `glossary_ids` of up to 5, not verified against the real API, see below) | Also `model_type` (`quality_optimized` = its own translation LLM / `latency_optimized` = faster). Since June 2026 all language pairs support all values. DeepL's documentation explicitly states that `context` is **not** for LLM-style instructions — it is real surrounding text, not a system prompt |
| **OpenAI / Anthropic / Gemini / DeepSeek / OpenRouter / Groq / Ollama (and any OpenAI-compatible endpoint)** | ✅ full, via chat turns in `messages[]` | ✅ via a prompt instruction (Tuhua builds the instruction and applies an additional placeholder mechanism for the "do not translate" terms — see [`llm-prompting.md`](llm-prompting.md)) | This is the family of engines Tuhua invested the most in: consolidated into a single base (`llm-base.js`), they share an output sanitizer, prompt templates and glossary |
| **Google Cloud Translation v3** | ⚠️ "Adaptive Translation" — accepts 5 to 30,000 reference pairs, the API picks the best ones and passes them to an LLM at inference | ✅ glossaries | Requires GCP credentials and is paid. **Tuhua does not use this** — the repo's `google-free` engine talks to the free web endpoint (`gtx`), which has none of the above |
| **Azure Translator** | ❌ | ⚠️ only via Custom Translator (requires training a model) and a simple phrase dictionary | Tuhua does not implement this engine |
| **LibreTranslate** | ❌ | ❌ | Tuhua's glossary is still applied to it, but as a literal substitution before sending the text — there is nothing on the engine's side |
| **Bing** | ❌ | ❌ | No native context or glossary. (Its two access methods were broken when this research was done; it was fixed later, in v3.13.102 — unrelated to this work.) |

## What Tuhua implements today, engine by engine

| Engine | Context | Glossary | State in Tuhua |
|---|---|---|---|
| DeepL | `context` (previous lines joined with `\n`, trimmed from the oldest if it exceeds 2000 characters — a self-imposed cap, not DeepL's) | `glossary_id` resolved per call (manual per profile, or auto-synced — see below) | Implemented. `model_type` is configurable (`prefer_quality_optimized` by default). Only one `glossary_id` is sent, not the plural variant — see "Out of scope". It also implements `custom_instructions` (3 hidden directives by default, per profile since v3.13.80) and `style_id` (wired up, no UI) — see the dedicated section below, not covered by the context/glossary table above |
| OpenAI / OpenRouter / DeepSeek / Google Gemini / Anthropic / Groq / local server (LM Studio, Ollama, llama.cpp, KoboldCpp) | Real chat turns for the previous dialogue, plus `{contextBoth}`/`{contextOriginal}`/`{contextTranslation}` available in the prompt template | Prompt instruction (`glossaryMode`: `literal` / `prompt` / `hybrid`, default `hybrid`) + an opaque placeholder for terms that must stay untranslated | Implemented, see [`llm-prompting.md`](llm-prompting.md) for the full detail |
| Google Translate (`google-free`), LibreTranslate, Custom MT | ❌ (no native mechanism) | Literal substitution before translating, with no prompt instruction (not applicable — they aren't prompt engines) | Unchanged in this work |
| Bing | ❌ | ❌ | Unchanged in this work |

### DeepL: automatic glossary per profile

A Tuhua profile (`profileStore`) can sync its effective glossary against
the user's DeepL account (`deeplAutoGlossary: true`), or use a
hand-set `glossary_id` (`deeplGlossaryId`) — the manual one wins if both
are configured. Syncing is lazy: it only calls the API if the glossary's
hash or the language pair changed since the last sync
(`src/services/translation/deepl-glossary-sync.js`). Off by default —
uploading character names/terms to the user's account as a persistent
resource is a decision the user makes per profile, not a silent behavior.

When a profile is deleted, its remote glossary in DeepL is deleted too
(best-effort, it never blocks deleting the profile if the call fails).

### DeepL: `custom_instructions`, `style_id`, `translation_memory_id` — verified against the real API, not the docs

Added 2026-08-22, when checking DeepL's documentation against what Tuhua
already had implemented (`deepl.js` since v3.11.28-29, before this
document existed). **DeepL's official documentation claims that
`custom_instructions` and `style_id` require the Pro API** — see
[About style rules](https://support.deepl.com/hc/en-us/articles/20515591890204-About-style-rules).
**This is incorrect**, at least for the account used in the verification:
tested with a real DeepL API Free key (`:fx`), requesting the same sentence
with contradictory instructions on the same text:

| Request | Output |
|---|---|
| without `custom_instructions` | `"Yuki-san, por favor, espérame en la estación."` |
| `["...replace -san with the word Senor..."]` | `"Senor Yuki, por favor, espérame en la estación."` |
| `["Use extremely archaic, formal Spanish..."]` | `"Vuestra merced, Yuki-san, ruego se digne aguardarme en la estación."` |

Both instructions changed the output unmistakably — the feature works on
Free. Full probe from that test:

| Parameter / endpoint | Free API | State in Tuhua |
|---|---|---|
| `custom_instructions` | ✅ works (verified above) | Implemented, full UI, **profile-scoped since v3.13.80** — same argument as `deeplGlossaryId`: which instructions to send depends on which GAME is active |
| `style_id` | ✅ available (`GET /v3/style_rules` → HTTP 200, empty list) | Wired up in the engine (`deepl.js`), **no UI** and no way to get an id from the app — you would have to create the rule list on DeepL's website first |
| `model_type: quality_optimized` | ✅ | Implemented, configurable only through settings, no UI |
| `translation_memory_id` | ❌ **HTTP 403 Forbidden** — requires a Business/Enterprise plan | Wired up in the engine (kept — 5 lines, serves anyone with that plan). The endpoint that lists the account's TMs (`deepl-fetch-translation-memories`) was **deleted** in v3.13.80: zero consumers in the renderer and it points to an endpoint unreachable on Free |

**If a future maintainer — or an AI assistant — reads the official
documentation and concludes that `custom_instructions`/`style_id` must be
gated behind a Pro plan detection: don't do it without repeating this test
first.** Likewise the existing precedent in
`scripts/test-deepl-glossary-sync.js`, which documents the same empirical
verification for glossaries — in this project the real API beats the
provider's documentation.

`deeplFormality` was deliberately left **global**, not per profile: it is
a single fixed axis with a UI the user may already have adjusted, a weaker
case than free-text instructions. If someone later asks for different
formality per game, it gets reconsidered then.

## Out of scope (explicit decisions, not gaps)

- **DeepL's plural `glossary_ids` (up to 5)**: not implemented. It could
  not be verified against the real API without risking untested behavior,
  and a Tuhua profile represents one VN with one effective glossary — a
  single `glossary_id` covers the real use case.
- **Google Cloud Translation v3 (Adaptive Translation)**: it would be a
  new, paid engine with GCP credentials — not an improvement to an
  existing engine. Out of scope for this work.
- **Azure Translator, as a new engine**: Tuhua does not implement it
  today; it is not part of this work.
- **Bing engine**: it has no native context or glossary, and it was not
  touched in this work. (It was broken at the time and was fixed later, in
  v3.13.102.)
- **UI for `style_id`**: it works on Free (see the section above), but
  requires creating the rule list on DeepL's website first —
  `custom_instructions` covers the same case without leaving the app. It
  would only be worth it for someone who needs to reuse >10 instructions
  across tools.
- **`translation_memory_id`**: 403 on Free, requires Business/Enterprise
  (see above). Tuhua already has a local TM with fuzzy matching, offline,
  no plan needed, isolated per profile — better for this use case.
- **Migrating glossaries to the v3 API** (multilingual, editable): the
  current v2 sync is lazy by hash and works; marginal benefit against the
  cost of migrating the delete+create.

## See also

- [`llm-prompting.md`](llm-prompting.md) — how Tuhua builds the prompt for
  the LLM engines, available variables, the glossary as an instruction,
  and how to add a new cloud provider to the table.

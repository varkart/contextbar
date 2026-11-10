#!/usr/bin/env python3
"""Refresh src-tauri/resources/pricing.json from LiteLLM's community price table.

Picks the newest Anthropic model per family (opus/sonnet/haiku) and converts
per-token costs to USD per MTok, then adds the non-Anthropic models in EXTRAS
(the ones other agents, e.g. OpenCode, record in session transcripts). Run by
.github/workflows/update-pricing.yml; safe to run locally:
python3 scripts/update-pricing.py
"""

import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

SOURCE = (
    "https://raw.githubusercontent.com/BerriAI/litellm/main/"
    "model_prices_and_context_window.json"
)
OUT = Path(__file__).resolve().parent.parent / "src-tauri" / "resources" / "pricing.json"
FAMILIES = ["opus", "sonnet", "haiku"]

# Non-Anthropic models, matched as a substring of the lowercased model id at
# runtime (first match wins, so more specific patterns go first — e.g. the
# free tier before the paid model it shares a name with). Each is
# (match, LiteLLM key to read first-party rates from, fallback (in, out) per
# MTok used when the key is missing). A None key means a fixed price.
EXTRAS = [
    ("glm-5.2:free", None, (0.0, 0.0)),  # OpenRouter spelling
    ("glm-5.2-free", None, (0.0, 0.0)),  # OpenCode Zen spelling
    ("deepseek-v4-flash", "deepseek/deepseek-v4-flash", (0.30, 1.20)),
    ("kimi-k3", "moonshot/kimi-k3", (3.0, 15.0)),
    ("glm-5.2", "zai/glm-5.2", (1.4, 4.4)),
    ("gemini-3.8-flash", "gemini-3.8-flash", (0.75, 3.75)),
]


def version_key(name: str) -> tuple:
    """Sortable version proxy: version numbers, then date stamps, then the id.

    The parts are kept in separate tuple slots. Concatenating them put a str
    where another id had an int (e.g. `claude-opus-4-1` vs
    `claude-opus-4-5-20251101`), which made max() raise TypeError.

    8-digit runs are release dates, not versions: read as a version,
    `claude-opus-4-20250514` would sort as 4.20250514 and beat 4.5.
    """
    runs = re.findall(r"\d+", name)
    versions = tuple(int(n) for n in runs if len(n) < 8)
    dates = tuple(int(n) for n in runs if len(n) >= 8)
    return (versions, dates, name)


def extra_models(table: dict) -> list:
    models = []
    for match, key, (fallback_in, fallback_out) in EXTRAS:
        info = table.get(key) if key else None
        if info and info.get("input_cost_per_token") is not None and info.get("output_cost_per_token") is not None:
            inp = round(float(info["input_cost_per_token"]) * 1e6, 4)
            out = round(float(info["output_cost_per_token"]) * 1e6, 4)
            origin = key
        else:
            inp, out = fallback_in, fallback_out
            origin = "fixed" if key is None else f"fallback (missing {key})"
        models.append(
            {"match": match, "inputPerMtok": inp, "outputPerMtok": out, "$from": origin}
        )
    return models


def build_payload(table: dict) -> dict:
    models = []
    read_mults, write_mults = [], []
    for family in FAMILIES:
        candidates = {
            k: v
            for k, v in table.items()
            if k.startswith("claude-")
            and family in k
            and isinstance(v, dict)
            and v.get("input_cost_per_token")
            and v.get("output_cost_per_token")
            and "/" not in k  # skip provider-prefixed duplicates
        }
        if not candidates:
            raise SystemExit(f"no candidates for family {family!r} — source format changed?")
        newest = max(candidates, key=version_key)
        info = candidates[newest]
        inp = float(info["input_cost_per_token"])
        out = float(info["output_cost_per_token"])
        models.append(
            {
                "match": family,
                "inputPerMtok": round(inp * 1e6, 4),
                "outputPerMtok": round(out * 1e6, 4),
                "$from": newest,
            }
        )
        if info.get("cache_read_input_token_cost"):
            read_mults.append(float(info["cache_read_input_token_cost"]) / inp)
        if info.get("cache_creation_input_token_cost"):
            write_mults.append(float(info["cache_creation_input_token_cost"]) / inp)

    models.extend(extra_models(table))

    return {
        "$comment": (
            "Approximate public API list prices in USD per MTok. Auto-refreshed "
            "weekly from LiteLLM's model_prices_and_context_window.json by "
            ".github/workflows/update-pricing.yml (opens a PR). Cache multipliers "
            "apply to the input rate."
        ),
        "updated": date.today().isoformat(),
        "source": "litellm",
        "cacheReadMultiplier": round(sum(read_mults) / len(read_mults), 4) if read_mults else 0.1,
        "cacheWriteMultiplier": round(sum(write_mults) / len(write_mults), 4) if write_mults else 1.25,
        "models": models,
    }


def main() -> None:
    # Optional argv[1]: path to an already-downloaded table (offline/dev use)
    if len(sys.argv) > 1:
        table = json.loads(Path(sys.argv[1]).read_text())
    else:
        with urllib.request.urlopen(SOURCE, timeout=60) as resp:
            table = json.load(resp)

    payload = build_payload(table)
    models = payload["models"]
    OUT.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {OUT}")
    for m in models:
        print(f"  {m['match']}: {m['inputPerMtok']}/{m['outputPerMtok']} per MTok (from {m['$from']})")


if __name__ == "__main__":
    main()

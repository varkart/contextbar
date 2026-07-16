#!/usr/bin/env python3
"""Refresh src-tauri/resources/pricing.json from LiteLLM's community price table.

Picks the newest Anthropic model per family (opus/sonnet/haiku) and converts
per-token costs to USD per MTok. Run by .github/workflows/update-pricing.yml;
safe to run locally: python3 scripts/update-pricing.py
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


def version_key(name: str) -> tuple:
    """Sortable version proxy: all numbers in the model id, then the id."""
    return tuple(int(n) for n in re.findall(r"\d+", name)) + (name,)


def main() -> None:
    # Optional argv[1]: path to an already-downloaded table (offline/dev use)
    if len(sys.argv) > 1:
        table = json.loads(Path(sys.argv[1]).read_text())
    else:
        with urllib.request.urlopen(SOURCE, timeout=60) as resp:
            table = json.load(resp)

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

    payload = {
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
    OUT.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {OUT}")
    for m in models:
        print(f"  {m['match']}: {m['inputPerMtok']}/{m['outputPerMtok']} per MTok (from {m['$from']})")


if __name__ == "__main__":
    main()

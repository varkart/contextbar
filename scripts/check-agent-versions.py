#!/usr/bin/env python3
"""Compare the latest published version of each supported coding-agent CLI
against the version our parsers were last verified with
(scripts/agent-versions.json).

A major or minor bump on a verified agent is "drift" — the on-disk format may
have changed and the parser needs re-verifying. Patch bumps are ignored.
Agents that were never verified, or have no public feed, are reported as info
only. Writes a markdown report and, under GitHub Actions, a `drift` output.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINES = os.path.join(ROOT, "scripts", "agent-versions.json")


def parse_version(text):
    m = re.search(r"(\d+)\.(\d+)\.(\d+)", text or "")
    return tuple(int(x) for x in m.groups()) if m else None


def classify(verified, latest):
    """'major' | 'minor' | 'patch' | 'same' | 'older' relative to `verified`."""
    if verified[0] != latest[0]:
        return "major" if latest[0] > verified[0] else "older"
    if verified[1] != latest[1]:
        return "minor" if latest[1] > verified[1] else "older"
    if verified[2] != latest[2]:
        return "patch" if latest[2] > verified[2] else "older"
    return "same"


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "contextbar-version-watch"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.load(resp)


def latest_version(source):
    kind = source["type"]
    if kind == "npm":
        pkg = source["package"].replace("/", "%2F")
        return fetch_json(f"https://registry.npmjs.org/{pkg}/latest")["version"]
    if kind == "json":
        return fetch_json(source["url"])[source["field"]]
    if kind == "brew":
        data = fetch_json(f"https://formulae.brew.sh/api/{source['kind']}/{source['name']}.json")
        return data["versions"]["stable"] if source["kind"] == "formula" else data["version"]
    if kind == "github_release":
        return fetch_json(f"https://api.github.com/repos/{source['repo']}/releases/latest")["tag_name"]
    raise ValueError(f"unknown source type {kind}")


def build_report(baselines, fetch=None):
    fetch = fetch or latest_version
    drift, info, errors = [], [], []
    for name, meta in baselines.items():
        if name.startswith("_"):
            continue
        sources = meta.get("sources") or []
        if not sources:
            info.append(f"- **{name}**: no public version feed — check by hand")
            continue
        verified_t = parse_version(meta.get("verified"))
        seen, worst = [], None
        for source in sources:
            label = source.get("label", source["type"])
            try:
                latest = fetch(source)
            except (urllib.error.URLError, OSError, KeyError, ValueError) as e:
                errors.append(f"- **{name}** ({label}): could not read latest version ({e})")
                continue
            latest_t = parse_version(latest)
            if latest_t is None:
                errors.append(f"- **{name}** ({label}): unparseable version {latest!r}")
                continue
            seen.append(f"{label} `{latest}`")
            if verified_t is not None:
                kind = classify(verified_t, latest_t)
                if kind in ("major", "minor") and (worst is None or kind == "major"):
                    worst = (kind, label, latest)
        if verified_t is None:
            if seen:
                info.append(
                    f"- **{name}**: {', '.join(seen)} — never verified against `{meta['parser']}`"
                )
        elif worst:
            kind, label, latest = worst
            drift.append(
                f"- **{name}**: verified `{meta['verified']}` ({meta.get('verified_date')}), "
                f"{label} has `{latest}` — **{kind}** bump. Channels: {', '.join(seen)}. "
                f"Re-verify `{meta['parser']}`. {meta.get('notes', '')}".rstrip()
            )
    return drift, info, errors


def main():
    with open(BASELINES) as f:
        baselines = json.load(f)
    drift, info, errors = build_report(baselines)

    lines = []
    if drift:
        lines += ["### Major/minor version drift", *drift, ""]
    if errors:
        lines += ["### Could not check", *errors, ""]
    if info:
        lines += ["### Not tracked against a baseline", *info, ""]
    report = "\n".join(lines) if lines else "No drift."
    print(report)

    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a") as f:
            f.write(f"drift={'true' if drift else 'false'}\n")
            f.write("report<<REPORT_EOF\n" + report + "\nREPORT_EOF\n")
    # Every feed failing means the check itself is broken — fail loudly.
    checked = sum(
        len(v.get("sources") or []) for k, v in baselines.items() if not k.startswith("_")
    )
    if checked and len(errors) >= checked:
        sys.exit(1)


if __name__ == "__main__":
    main()

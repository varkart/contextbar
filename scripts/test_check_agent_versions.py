import importlib.util
import os
import unittest

spec = importlib.util.spec_from_file_location(
    "check_agent_versions",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "check-agent-versions.py"),
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class ClassifyTests(unittest.TestCase):
    def test_levels(self):
        v = (1, 18, 27)
        self.assertEqual(mod.classify(v, (1, 18, 35)), "patch")
        self.assertEqual(mod.classify(v, (1, 19, 0)), "minor")
        self.assertEqual(mod.classify(v, (2, 0, 20)), "major")
        self.assertEqual(mod.classify(v, (1, 18, 27)), "same")
        self.assertEqual(mod.classify(v, (1, 17, 0)), "older")

    def test_parse_version_extracts_semver(self):
        self.assertEqual(mod.parse_version("v2.15.0"), (2, 15, 0))
        self.assertEqual(mod.parse_version("kiro-cli 2.28.0 (abc)"), (2, 28, 0))
        self.assertIsNone(mod.parse_version("nightly"))


class ReportTests(unittest.TestCase):
    def baselines(self):
        return {
            "_comment": "ignored",
            "opencode": {
                "sources": [
                    {"label": "npm", "type": "npm", "package": "x"},
                    {"label": "brew core", "type": "brew", "kind": "formula", "name": "oc"},
                ],
                "verified": "1.18.27",
                "parser": "p.rs",
            },
            "kiro": {"sources": [{"type": "npm", "package": "y"}], "verified": None, "parser": "k.rs"},
            "agy": {"sources": [], "verified": None, "parser": "a.rs"},
        }

    def fetcher(self, versions):
        def fetch(source):
            return versions[source.get("package") or source["name"]]

        return fetch

    def test_patch_bump_is_not_drift(self):
        drift, info, errors = mod.build_report(
            self.baselines(), fetch=self.fetcher({"x": "1.18.35", "oc": "1.18.31", "y": "2.28.0"})
        )
        self.assertEqual(drift, [])
        self.assertEqual(len(info), 2)  # unverified kiro + feedless agy

    def test_major_bump_on_any_channel_is_drift(self):
        # npm is still on 1.x but Homebrew core ships 2.x — must still flag.
        drift, _, _ = mod.build_report(
            self.baselines(), fetch=self.fetcher({"x": "1.18.35", "oc": "2.0.20", "y": "2.28.0"})
        )
        self.assertEqual(len(drift), 1)
        self.assertIn("major", drift[0])
        self.assertIn("brew core", drift[0])
        self.assertIn("npm `1.18.35`", drift[0])

    def test_one_failing_channel_does_not_hide_drift_on_another(self):
        def fetch(source):
            if source["type"] == "npm" and source["package"] == "x":
                raise OSError("down")
            return {"oc": "2.0.20", "y": "2.28.0"}[source.get("package") or source["name"]]

        drift, _, errors = mod.build_report(self.baselines(), fetch=fetch)
        self.assertEqual(len(drift), 1)
        self.assertEqual(len(errors), 1)

    def test_fetch_error_is_reported_not_raised(self):
        def boom(source):
            raise OSError("down")

        drift, _, errors = mod.build_report(self.baselines(), fetch=boom)
        self.assertEqual(drift, [])
        self.assertEqual(len(errors), 3)


if __name__ == "__main__":
    unittest.main()

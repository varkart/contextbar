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
            "opencode": {"source": {"type": "npm", "package": "x"}, "verified": "1.18.27", "parser": "p.rs"},
            "kiro": {"source": {"type": "npm", "package": "y"}, "verified": None, "parser": "k.rs"},
            "agy": {"source": None, "verified": None, "parser": "a.rs"},
        }

    def run_report(self, versions):
        return mod.build_report(self.baselines(), fetch=lambda source: versions[source["package"]])

    def test_patch_bump_is_not_drift(self):
        drift, info, errors = self.run_report({"x": "1.18.35", "y": "2.28.0"})
        self.assertEqual(drift, [])
        self.assertEqual(len(info), 2)  # unverified kiro + feedless agy

    def test_major_bump_is_drift(self):
        drift, _, _ = self.run_report({"x": "2.0.20", "y": "2.28.0"})
        self.assertEqual(len(drift), 1)
        self.assertIn("major", drift[0])

    def test_fetch_error_is_reported_not_raised(self):
        def boom(source):
            raise OSError("down")

        drift, _, errors = mod.build_report(self.baselines(), fetch=boom)
        self.assertEqual(drift, [])
        self.assertEqual(len(errors), 2)


if __name__ == "__main__":
    unittest.main()

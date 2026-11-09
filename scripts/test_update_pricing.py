import importlib.util
import os
import unittest

spec = importlib.util.spec_from_file_location(
    "update_pricing",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "update-pricing.py"),
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def claude(inp, out):
    return {"input_cost_per_token": inp, "output_cost_per_token": out}


class VersionKeyTests(unittest.TestCase):
    def test_ids_with_different_digit_counts_are_comparable(self):
        # Regression: this raised "'>' not supported between 'str' and 'int'"
        # in the weekly workflow when ids had different numbers of digit runs.
        ids = ["claude-opus-4-1", "claude-opus-4-5-20251101", "claude-opus-5-5"]
        self.assertEqual(max(ids, key=mod.version_key), "claude-opus-5-5")

    def test_newer_minor_beats_older(self):
        self.assertGreater(
            mod.version_key("claude-sonnet-4-5"), mod.version_key("claude-sonnet-4-1")
        )


class BuildPayloadTests(unittest.TestCase):
    def table(self):
        return {
            "claude-opus-4-1": claude(15e-6, 75e-6),
            "claude-opus-4-5-20251101": claude(5e-6, 25e-6),
            "claude-sonnet-4-5": claude(3e-6, 15e-6),
            "claude-haiku-4-5": claude(1e-6, 5e-6),
            "moonshot/kimi-k3": claude(3e-6, 15e-6),
            "deepseek/deepseek-v4-flash": claude(3e-7, 1.2e-6),
        }

    def test_builds_claude_families_and_extras(self):
        payload = mod.build_payload(self.table())
        by_match = {m["match"]: m for m in payload["models"]}
        self.assertEqual(by_match["opus"]["$from"], "claude-opus-4-5-20251101")
        self.assertEqual(by_match["kimi-k3"]["inputPerMtok"], 3.0)
        self.assertEqual(by_match["deepseek-v4-flash"]["outputPerMtok"], 1.2)

    def test_missing_extra_falls_back_to_fixed_rates(self):
        by_match = {m["match"]: m for m in mod.build_payload(self.table())["models"]}
        # zai/glm-5.2 and gemini-3.8-flash are absent from the table above.
        self.assertEqual(by_match["glm-5.2"]["inputPerMtok"], 1.4)
        self.assertIn("fallback", by_match["glm-5.2"]["$from"])

    def test_free_tier_is_listed_before_the_paid_model_with_the_same_name(self):
        matches = [m["match"] for m in mod.build_payload(self.table())["models"]]
        self.assertLess(matches.index("glm-5.2:free"), matches.index("glm-5.2"))
        free = next(m for m in mod.build_payload(self.table())["models"] if m["match"] == "glm-5.2:free")
        self.assertEqual((free["inputPerMtok"], free["outputPerMtok"]), (0.0, 0.0))


if __name__ == "__main__":
    unittest.main()

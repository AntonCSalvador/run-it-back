"""Stdlib-only subprocess checks for the explicit audit/extract CLI modes."""
import subprocess
import sys
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("verify-champions-extraction.py")


class ExtractionCliTests(unittest.TestCase):
    def run_cli(self, *arguments):
        return subprocess.run([sys.executable, str(SCRIPT), *arguments], capture_output=True, text=True)

    def test_help_explains_both_modes(self):
        result = self.run_cli("--help")
        self.assertEqual(result.returncode, 0)
        self.assertIn("--check", result.stdout)
        self.assertIn("--extract", result.stdout)

    def test_modes_are_mutually_exclusive_before_any_file_access(self):
        result = self.run_cli("does-not-exist.duckdb", "--check", "--extract")
        self.assertEqual(result.returncode, 2)
        self.assertIn("not allowed with argument", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_mode_selection_is_required_before_any_file_access(self):
        result = self.run_cli("does-not-exist.duckdb")
        self.assertEqual(result.returncode, 2)
        self.assertIn("required", result.stderr)
        self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()

"""Guard provider footage generatif: tidak boleh memalsukan klip."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import video_render_runner as runner  # noqa: E402


class GenerationGuardTest(unittest.TestCase):
    def test_tanpa_generation_lolos(self) -> None:
        runner.assert_generation_supported({})

    def test_generation_nonaktif_lolos(self) -> None:
        runner.assert_generation_supported({"generation": {"provider": "none", "enabled": False}})

    def test_provider_none_tapi_aktif_ditolak(self) -> None:
        with self.assertRaises(RuntimeError) as ctx:
            runner.assert_generation_supported({"generation": {"provider": "none", "enabled": True}})
        self.assertEqual(str(ctx.exception), "Provider footage generatif belum dikonfigurasi.")

    def test_provider_belum_diimplementasikan_ditolak(self) -> None:
        with self.assertRaises(RuntimeError) as ctx:
            runner.assert_generation_supported({"generation": {"provider": "replicate", "enabled": True}})
        self.assertIn("replicate", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()


class GuardPlacementTest(unittest.TestCase):
    """Guard harus berjalan untuk semua template, bukan hanya jalur story."""

    def test_guard_tidak_berada_di_dalam_cabang_story_mode(self) -> None:
        import ast

        tree = ast.parse(Path(runner.__file__).read_text(encoding="utf-8"))
        parents: dict[ast.AST, ast.AST] = {}
        for node in ast.walk(tree):
            for child in ast.iter_child_nodes(node):
                parents[child] = node

        calls = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "assert_generation_supported"
        ]
        self.assertTrue(calls, "assert_generation_supported tidak dipanggil di runner")

        for call in calls:
            node: ast.AST = call
            while node in parents:
                node = parents[node]
                if isinstance(node, ast.If) and "story_mode" in ast.dump(node.test):
                    self.fail("guard hanya berjalan bila story_mode aktif")

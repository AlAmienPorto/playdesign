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

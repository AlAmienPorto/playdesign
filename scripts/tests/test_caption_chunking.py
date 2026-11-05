import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import video_spec  # noqa: E402


class SplitLongCuesTest(unittest.TestCase):
    def test_short_cue_untouched(self):
        cues = [{"startMs": 0, "endMs": 1200, "text": "Codex makin canggih!"}]
        self.assertEqual(video_spec.split_long_cues(cues), cues)

    def test_long_cue_is_split_under_limit(self):
        text = (
            "Codex juga mendapat Images 2.6, dengan pembuatan gambar lebih cepat, "
            "editing lebih presisi, bahkan kemampuan membuat GIF animasi!"
        )
        cues = [{"startMs": 5000, "endMs": 12000, "text": text}]
        out = video_spec.split_long_cues(cues, max_chars=46)
        self.assertGreater(len(out), 1)
        for cue in out:
            self.assertLessEqual(len(cue["text"]), 46, cue["text"])
        self.assertEqual(" ".join(cue["text"] for cue in out).split(), text.split())

    def test_timing_contiguous_and_within_bounds(self):
        cues = [{"startMs": 1000, "endMs": 9000, "text": "satu dua tiga empat lima enam tujuh delapan sembilan sepuluh sebelas dua belas"}]
        out = video_spec.split_long_cues(cues, max_chars=20)
        self.assertEqual(out[0]["startMs"], 1000)
        self.assertEqual(out[-1]["endMs"], 9000)
        for previous, current in zip(out, out[1:]):
            self.assertEqual(previous["endMs"], current["startMs"])
            self.assertGreater(current["endMs"], current["startMs"])

    def test_splits_prefer_comma(self):
        cues = [{"startMs": 0, "endMs": 4000, "text": "pertama pendek, kedua juga pendek, ketiga agak panjang sedikit"}]
        out = video_spec.split_long_cues(cues, max_chars=30)
        self.assertTrue(out[0]["text"].endswith(","), out[0]["text"])

    def test_empty_and_invalid_cues_survive(self):
        cues = [{"startMs": 0, "endMs": 0, "text": ""}, {"startMs": 10, "endMs": 20, "text": "oke"}]
        out = video_spec.split_long_cues(cues)
        self.assertEqual(len(out), 2)
        self.assertTrue(all(cue["endMs"] > cue["startMs"] for cue in out))


if __name__ == "__main__":
    unittest.main()

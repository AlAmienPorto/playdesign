"""Uji runner ekspor carousel tanpa akun Google sungguhan.

Fokus: dokumen -> SVG 1080x1350 -> PNG nyata lewat ImageMagick, caption +
manifest, dan kontrak unggah per berkas (satu folder Drive per job). Unggahan
diinjeksi supaya tes tidak menyentuh Drive.

Jalankan: python3 scripts/tests/test_carousel_export.py
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import carousel_export_runner as runner  # noqa: E402

DOCUMENT = {
    "kicker": "PLAYDESIGN / CAROUSEL",
    "template": "split-brand",
    "headline": "Audit identitas <brand> & warna",
    "highlight": "identitas",
    "sourceName": "Nusa Beauty",
    "sourceUrl": "https://example.com/sumber",
    "coverImageUrl": "",
    "slides": [
        {"id": "s1", "kind": "cover", "title": "Audit identitas <brand> & warna", "body": ""},
        {"id": "s2", "kind": "text", "title": "Langkah 1: cek konsistensi", "body": "Warna dan tipografi harus sama di semua titik sentuh."},
        {"id": "s3", "kind": "text", "title": "Langkah 2: uji keterbacaan", "body": "Logo harus tetap terbaca di ukuran 16px."},
    ],
    "caption": "Audit identitas brand bukan cuma soal logo.",
    "hashtags": ["brandidentity", "#playdesign"],
    "updatedAt": "2026-11-08T01:00:00.000Z",
}

JOB = {
    "id": "cj-uji-abc123",
    "postId": "so-uji",
    "title": "Audit Identitas Brand",
    "createdAt": "2026-11-08T01:00:00.000Z",
    "document": DOCUMENT,
}


class FakeUploader:
    def __init__(self):
        self.calls: list[tuple[str, str, str, str]] = []

    def __call__(self, local: Path, name: str, folder_path: str, job_id: str, mime: str) -> dict:
        assert local.exists(), f"berkas tidak ada: {local}"
        self.calls.append((name, folder_path, job_id, mime))
        file_id = f"file-{len(self.calls)}"
        return {
            "id": file_id,
            "webViewLink": f"https://drive.google.com/file/d/{file_id}/view",
            "folderId": "folder-carousel-1",
        }


def fake_render(_svg: str, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(b"\x89PNG\r\n\x1a\n" + b"x" * 1024)


def main() -> int:
    checks: list[tuple[str, bool, str]] = []

    def check(label: str, ok: bool, detail: str = ""):
        checks.append((label, ok, detail))
        print(("PASS " if ok else "FAIL ") + label + (f"  [{detail}]" if detail else ""))

    # ---------- teks & nama ----------
    check("slugify merapikan judul", runner.slugify("Audit Identitas Brand!") == "audit-identitas-brand")
    check("slugify punya fallback", runner.slugify("   ") == "carousel")
    check("escape_xml menetralkan tag", runner.escape_xml("<b>&</b>") == "&lt;b&gt;&amp;&lt;/b&gt;")
    check("slide_filename cover", runner.slide_filename(0, "cover") == "01-cover.png")
    check("slide_filename teks", runner.slide_filename(2, "text") == "03-slide.png")

    svg = runner.build_slide_svg(DOCUMENT, 0)
    check("SVG berukuran 1080x1350", 'width="1080"' in svg and 'height="1350"' in svg)
    check("SVG meng-escape judul", "&lt;brand&gt;" in svg and "<brand>" not in svg)
    check("SVG memuat nomor slide", "01 / 03" in svg)
    check("SVG memuat sumber cover", "Sumber: Nusa Beauty" in svg)

    text_svg = runner.build_slide_svg(DOCUMENT, 1)
    check("SVG slide teks memakai isi slide", "Warna dan tipografi" in text_svg)

    folder = runner.folder_path_for(JOB)
    check("folder memakai bulan & slug", folder.startswith("Playdesign Carousel/2026-11/"), folder)
    check("folder memakai akhiran job", folder.endswith("-abc123"), folder)

    caption = runner.build_caption(DOCUMENT)
    check("caption menambahkan # pada hashtag", "#brandidentity #playdesign" in caption)
    check("caption memuat teks asli", caption.startswith("Audit identitas brand"))

    # ---------- alur job dengan I/O injeksi ----------
    uploader = FakeUploader()
    result = runner.export_job(JOB, render=fake_render, upload=uploader)

    names = [call[0] for call in uploader.calls]
    check("3 slide dirender & diunggah", names[:3] == ["01-cover.png", "02-slide.png", "03-slide.png"], str(names))
    check("caption ikut diunggah", "caption.txt" in names)
    check("manifest ikut diunggah", "manifest.json" in names)
    check("semua berkas satu folder", len({call[1] for call in uploader.calls}) == 1, str(uploader.calls[0][1]))
    check("jobId per berkas unik", len({call[2] for call in uploader.calls}) == len(uploader.calls))
    check("mime PNG dipakai", all(call[3] == "image/png" for call in uploader.calls[:3]))
    check("hasil mencatat jumlah slide", result["slideCount"] == 3, str(result["slideCount"]))
    check("hasil mencatat folder Drive", result["driveFolderId"] == "folder-carousel-1")
    check(
        "link folder Drive terbentuk",
        result["driveFolderLink"] == "https://drive.google.com/drive/folders/folder-carousel-1",
        str(result["driveFolderLink"]),
    )
    check("manifest file id tercatat", result["manifestFileId"] == "file-5", str(result["manifestFileId"]))
    check("total byte dihitung", result["bytes"] == 3 * (8 + 1024), str(result["bytes"]))
    check("setiap slide punya driveFileId", all(item["driveFileId"] for item in result["files"]))

    # ---------- penolakan jujur ----------
    empty = dict(JOB)
    empty["document"] = {**DOCUMENT, "slides": []}
    try:
        runner.export_job(empty, render=fake_render, upload=FakeUploader())
        check("dokumen tanpa slide ditolak", False)
    except RuntimeError as exc:
        check("dokumen tanpa slide ditolak", "slide" in str(exc).lower(), str(exc)[:60])

    class BrokenUploader(FakeUploader):
        def __call__(self, local, name, folder_path, job_id, mime):
            return {"id": "", "webViewLink": ""}

    try:
        runner.export_job(JOB, render=fake_render, upload=BrokenUploader())
        check("Drive tanpa file id ditolak", False)
    except RuntimeError as exc:
        check("Drive tanpa file id ditolak", "file id" in str(exc), str(exc)[:60])

    # ---------- render PNG nyata ----------
    binary = shutil.which(os.environ.get("CAROUSEL_RENDER_BIN", "convert")) or shutil.which("magick")
    if not binary:
        check("render PNG nyata (ImageMagick)", False, "ImageMagick tidak tersedia")
    else:
        tmp = Path(tempfile.mkdtemp(prefix="pd-carousel-test-"))
        try:
            png = tmp / "01-cover.png"
            runner.render_png(runner.build_slide_svg(DOCUMENT, 0), png)
            size = subprocess.run(
                ["identify", "-format", "%wx%h", str(png)], capture_output=True, text=True, timeout=60
            ).stdout.strip()
            check("render PNG nyata 1080x1350", size == "1080x1350", size or "identify gagal")
            check("PNG punya isi", png.stat().st_size > 5000, f"{png.stat().st_size} bytes")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

# ---------- publish ke Tebar (klien palsu) ----------
    class FakeClient:
        def __init__(self):
            self.uploads = []
            self.posts = []

        def available(self):
            return True, "siap"

        def list_accounts(self):
            return [{"id": "acc-ig", "platform": "instagram", "username": "plydsgn"}]

        def account_for(self, platform, accounts=None):
            return next((a for a in (accounts or self.list_accounts()) if a["platform"] == platform), None)

        def upload_file(self, path, keep=False):
            self.uploads.append(Path(path).name)
            return {"id": f"media-{len(self.uploads)}"}

        def create_post(self, **kwargs):
            self.posts.append(kwargs)
            return {"postId": "post-abc", "raw": "scheduled"}

    fake = FakeClient()
    publish_job = {"id": "cj-1", "postId": "p-1", "publishAt": "2027-01-01T00:00:00Z", "publishAccounts": ["instagram"], "document": DOCUMENT}
    result = runner.publish_job(publish_job, client=fake)
    check("publish mengunggah semua slide berurutan", fake.uploads == ["01-cover.png", "02-slide.png", "03-slide.png"], str(fake.uploads))
    check("publish memakai media_ids berurutan", fake.posts[0]["media_ids"] == ["media-1", "media-2", "media-3"], str(fake.posts[0]["media_ids"]))
    check("publish mengirim waktu jadwal", fake.posts[0]["scheduled_at"] == "2027-01-01T00:00:00Z", str(fake.posts[0].get("scheduled_at")))
    check("publish mengirim caption + hashtag", "#playdesign" in fake.posts[0]["text"], fake.posts[0]["text"][:80])
    check("publish mengembalikan post id", result["postId"] == "post-abc", str(result))

    class MissingClient(FakeClient):
        def list_accounts(self):
            return []

    try:
        runner.publish_job({"id": "cj-2", "document": DOCUMENT, "publishAccounts": ["threads"]}, client=MissingClient())
        check("publish menolak akun belum terhubung", False, "tidak melempar error")
    except RuntimeError as exc:
        check("publish menolak akun belum terhubung", "threads" in str(exc), str(exc))

# ---------- template & cover ----------
    check("cover menolak URL non-http", runner.fetch_cover("file:///etc/passwd", Path("/tmp/x")) is None, "harus None")
    check("cover menolak URL kosong", runner.fetch_cover("", Path("/tmp/x")) is None, "harus None")

    brand = runner.build_slide_svg(dict(DOCUMENT, template="split-brand"), 0)
    dark = runner.build_slide_svg(dict(DOCUMENT, template="split-dark"), 0)
    full = runner.build_slide_svg(dict(DOCUMENT, template="full-image"), 0)
    check("template split-dark beda palet", "#090b10" in dark and "#090b10" not in brand, "palet")
    check("template full-image tanpa bar samping", "<rect x=\"0\" y=\"0\" width=\"24\"" not in full, "bar")
    poster = runner.build_slide_svg(dict(DOCUMENT, template="poster"), 0)
    kolase = runner.build_slide_svg(dict(DOCUMENT, template="kolase"), 0)
    blok = runner.build_slide_svg(dict(DOCUMENT, template="blok"), 0)
    check("template full-image menyiapkan overlay transparan", "<image" not in full and "<rect" in full, "overlay")
    check("template poster memakai nomor edisi raksasa", 'font-size="380"' in poster, "nomor")
    check("template kolase menumpuk tiga blok", kolase.count("fill-opacity=\"0.20\"") == 1, "blok")
    check(
        "template blok berlatar aksen penuh dan kapital",
        '<rect width="1080" height="1350" fill="#ef5a6b"' in blok and DOCUMENT["headline"].upper()[:10] in blok,
        "blok tebal",
    )

    # ---------- brand kit (aksen + handle) ----------
    accented = runner.build_slide_svg(dict(DOCUMENT, accent="#1e6f5c", brandHandle="plydsgn"), 0)
    check("aksen brand menimpa palet template", "#1e6f5c" in accented and "#bf1d2d" not in accented, "aksen")
    check("handle brand tampil di footer", ">@plydsgn<" in accented, "handle")
    check("handle dengan @ dinormalkan", ">@plydsgn<" in runner.build_slide_svg(dict(DOCUMENT, brandHandle="@plydsgn"), 0), "handle")
    check("footer default tetap playdesign", ">playdesign<" in brand, "default")
    check("aksen tidak valid diabaikan", "#bf1d2d" in runner.build_slide_svg(dict(DOCUMENT, accent="merah"), 0), "validasi")
    check(
        "normalisasi hex aksen",
        runner.normalize_hex_accent("1E6F5C") == "#1e6f5c"
        and runner.normalize_hex_accent("#abc") == "#abc"
        and runner.normalize_hex_accent("#12345") == ""
        and runner.normalize_hex_accent("") == "",
        "hex",
    )
    check(
        "normalisasi handle brand",
        runner.normalize_brand_handle("  @ply dsgn  ") == "@plydsgn"
        and runner.normalize_brand_handle("plydsgn") == "@plydsgn"
        and runner.normalize_brand_handle("   ") == "",
        "handle",
    )

    failed = [label for label, ok, _ in checks if not ok]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} lulus")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

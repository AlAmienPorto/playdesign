#!/usr/bin/env python3

from build_magnificent_figcraft import FigCraftEngine


NAVY = "#0B1220"
NAVY_2 = "#111C31"
NAVY_3 = "#182641"
WHITE = "#FFFFFF"
CANVAS = "#F4F6FA"
INK = "#14213D"
MUTED = "#6F7890"
LINE = "#DCE2EC"
BLUE = "#4567EB"
BLUE_SOFT = "#EAF0FF"
CORAL = "#FF7658"
MINT = "#6DD7B1"
VIOLET = "#9887F5"
RED = "#D9384E"


class LoginDesign:
    def __init__(self):
        self.engine = FigCraftEngine("Playdesign Office CRM — Modern Login")
        page = self.engine.nodes[str(self.engine.page_id)]
        page["name"] = "Modern login"
        page["background"] = self._hex("#080D17")

    @staticmethod
    def _hex(value):
        value = value.lstrip("#")
        return {
            "r": int(value[0:2], 16) / 255,
            "g": int(value[2:4], 16) / 255,
            "b": int(value[4:6], 16) / 255,
            "a": 1,
        }

    def frame(self, parent, name, x, y, width, height, color, radius=0, stroke=None):
        return self.engine.create_frame(
            name,
            parent,
            x,
            y,
            width,
            height,
            bg_hex=color,
            stroke_hex=stroke,
            stroke_w=1,
            radius=radius,
        )

    def rect(self, parent, name, x, y, width, height, color, radius=0, stroke=None):
        return self.engine.create_rect(
            name,
            parent,
            x,
            y,
            width,
            height,
            bg_hex=color,
            stroke_hex=stroke,
            stroke_w=1,
            radius=radius,
        )

    def text(self, parent, name, x, y, width, height, value, size, color, weight="Regular", spacing=0):
        node = self.engine.create_text(
            name,
            parent,
            x,
            y,
            width,
            height,
            value,
            size=size,
            weight=weight,
            color_hex=color,
            letter_spacing=spacing,
        )
        self.engine.nodes[str(node)]["style"]["font_family"] = "Plus Jakarta Sans"
        return node

    def brand(self, parent, x, y, dark=False, compact=False):
        mark = self.frame(parent, "Playdesign mark", x, y, 38 if compact else 44, 38 if compact else 44, BLUE, 12)
        self.rect(mark, "Mark top", 10, 10, 18 if compact else 22, 6, WHITE, 3)
        self.rect(mark, "Mark middle", 10, 19, 13 if compact else 16, 6, CORAL, 3)
        self.rect(mark, "Mark bottom", 10, 28, 8 if compact else 10, 4, MINT, 2)
        self.text(
            parent,
            "Brand name",
            x + (50 if compact else 58),
            y + 4,
            260,
            24,
            "Playdesign Office",
            15 if compact else 17,
            WHITE if dark else INK,
            "Bold",
        )
        self.text(
            parent,
            "Brand product",
            x + (50 if compact else 58),
            y + 25,
            220,
            18,
            "Customer relationship management",
            9 if compact else 10,
            "#9CA9C0" if dark else MUTED,
            "Medium",
        )

    def stage(self, parent, x, y, label, count, color, width=146):
        card = self.frame(parent, f"Stage {label}", x, y, width, 94, NAVY_3, 14, "#253653")
        self.rect(card, "Stage accent", 0, 0, width, 4, color, 2)
        self.text(card, "Stage label", 14, 16, width - 28, 20, label, 11, "#A8B6CB", "SemiBold")
        self.text(card, "Stage count", 14, 42, 52, 35, count, 25, WHITE, "Bold")
        self.text(card, "Stage suffix", 56, 53, width - 70, 20, "leads", 10, "#8D9BB1", "Medium")
        return card

    def build_crm_scene(self, parent):
        self.brand(parent, 58, 52, dark=True)
        status = self.frame(parent, "Live status", 616, 55, 110, 34, NAVY_3, 17, "#2B3B58")
        self.rect(status, "Live dot", 14, 13, 8, 8, MINT, 4)
        self.text(status, "Live text", 30, 8, 70, 18, "Live workspace", 10, "#C7D3E5", "SemiBold")

        self.text(parent, "Hero title 1", 58, 148, 630, 68, "Pipeline jelas.", 52, WHITE, "Bold")
        self.text(parent, "Hero title 2", 58, 210, 630, 68, "Tim bergerak.", 52, WHITE, "Bold")
        self.text(
            parent,
            "Hero description",
            60,
            302,
            540,
            58,
            "Pantau setiap peluang, tindak lanjut, dan deal dalam satu alur kerja yang rapi.",
            15,
            "#A7B4C8",
            "Regular",
        )

        board = self.frame(parent, "CRM pipeline preview", 58, 408, 670, 348, NAVY_2, 22, "#24334E")
        self.text(board, "Board title", 24, 22, 240, 24, "Pipeline minggu ini", 15, WHITE, "Bold")
        self.text(board, "Board period", 528, 24, 118, 20, "4–10 Nov 2026", 10, "#99A8BD", "Medium")

        self.stage(board, 24, 74, "Prospek baru", "18", CORAL)
        self.stage(board, 187, 74, "Dihubungi", "12", VIOLET)
        self.stage(board, 350, 74, "Proposal", "07", MINT)
        self.stage(board, 513, 74, "Deal", "04", BLUE)

        activity = self.frame(board, "Latest activity", 24, 186, 400, 138, "#0E182A", 14, "#24334E")
        self.text(activity, "Activity heading", 16, 13, 180, 18, "Aktivitas terbaru", 11, "#AEBBD0", "SemiBold")
        self.rect(activity, "Avatar 1", 16, 46, 32, 32, CORAL, 10)
        self.text(activity, "Avatar 1 text", 25, 52, 20, 18, "A", 11, WHITE, "Bold")
        self.text(activity, "Activity 1", 60, 43, 220, 22, "Arunika menerima proposal", 11, WHITE, "SemiBold")
        self.text(activity, "Activity 1 time", 60, 64, 150, 18, "12 menit lalu", 9, "#8190A7", "Medium")
        self.rect(activity, "Avatar 2", 16, 92, 32, 32, VIOLET, 10)
        self.text(activity, "Avatar 2 text", 25, 98, 20, 18, "R", 11, WHITE, "Bold")
        self.text(activity, "Activity 2", 60, 89, 250, 22, "Ruang Sore pindah ke Deal", 11, WHITE, "SemiBold")
        self.text(activity, "Activity 2 time", 60, 110, 150, 18, "38 menit lalu", 9, "#8190A7", "Medium")

        value = self.frame(board, "Pipeline value", 441, 186, 205, 138, BLUE, 14)
        self.text(value, "Value label", 16, 15, 170, 20, "Nilai pipeline", 11, "#DDE5FF", "SemiBold")
        self.text(value, "Value amount", 16, 45, 175, 38, "Rp 428 jt", 25, WHITE, "Bold")
        self.text(value, "Value change", 16, 96, 166, 20, "+12% dari minggu lalu", 10, "#DDE5FF", "Medium")

        self.text(parent, "Security note", 60, 794, 520, 20, "Workspace terlindungi • Sesi aktif selama 30 hari", 10, "#718199", "Medium")

    def password_form(self, parent, x, y, width, mode="password", error=False, mobile=False):
        title_size = 32 if mobile else 38
        self.text(parent, "Welcome", x, y, width, 48, "Selamat datang", title_size, INK, "Bold")
        self.text(
            parent,
            "Welcome detail",
            x,
            y + 58,
            width,
            46,
            "Masuk untuk melanjutkan pekerjaan tim Anda.",
            14,
            MUTED,
            "Regular",
        )

        label = "API token" if mode == "token" else "Password workspace"
        placeholder = "Masukkan token 64 karakter" if mode == "token" else "Masukkan password"
        self.text(parent, "Field label", x, y + 142, width, 22, label, 12, INK, "SemiBold")
        field_stroke = RED if error else "#CAD2E0"
        field = self.frame(parent, "Access field", x, y + 170, width, 58, WHITE, 12, field_stroke)
        self.rect(field, "Lock icon", 17, 19, 18, 20, BLUE_SOFT if mode == "token" else "#EDF0F6", 6)
        self.text(field, "Field value", 48, 18, width - 94, 24, placeholder, 12, "#929BAD", "Medium")
        if mode == "password":
            self.text(field, "Show password", width - 52, 18, 32, 22, "Lihat", 9, BLUE, "Bold")

        next_y = y + 243
        if error:
            self.text(parent, "Error message", x, next_y, width, 22, "Password tidak sesuai. Periksa lalu coba lagi.", 11, RED, "Medium")
            next_y += 38

        button = self.frame(parent, "Primary login button", x, next_y, width, 58, BLUE, 12)
        self.text(button, "Primary button label", 24, 18, width - 72, 24, "Masuk ke workspace", 13, WHITE, "Bold")
        self.frame(button, "Button arrow", width - 42, 15, 28, 28, "#5F7BF0", 8)
        self.text(button, "Button arrow icon", width - 33, 18, 15, 20, "›", 16, WHITE, "Bold")

        alt_y = next_y + 82
        self.rect(parent, "Divider left", x, alt_y + 9, width / 2 - 54, 1, LINE)
        self.text(parent, "Divider text", x + width / 2 - 40, alt_y, 80, 20, "atau", 10, MUTED, "Medium")
        self.rect(parent, "Divider right", x + width / 2 + 54, alt_y + 9, width / 2 - 54, 1, LINE)

        alt = self.frame(parent, "Alternate login", x, alt_y + 32, width, 52, "#F8FAFD", 12, LINE)
        alt_label = "Kembali ke password" if mode == "token" else "Masuk dengan API token"
        self.text(alt, "Alternate login label", 18, 15, width - 36, 22, alt_label, 11, INK, "SemiBold")

        self.text(
            parent,
            "Session help",
            x,
            alt_y + 112,
            width,
            40,
            "Sesi berlaku selama 30 hari pada perangkat ini.",
            10,
            MUTED,
            "Regular",
        )

    def desktop(self):
        page = self.engine.page_id
        artboard = self.frame(page, "Desktop • Modern login", 0, 0, 1440, 900, CANVAS)
        visual = self.frame(artboard, "CRM story", 20, 20, 790, 860, NAVY, 28)
        self.build_crm_scene(visual)
        auth = self.frame(artboard, "Login panel", 830, 20, 590, 860, WHITE, 28)
        self.brand(auth, 58, 52)
        self.password_form(auth, 80, 244, 430)
        self.text(auth, "Footer", 80, 799, 430, 20, "© 2026 Playdesign Office", 9, "#A0A8B7", "Medium")
        self.text(auth, "Support", 386, 799, 124, 20, "Butuh bantuan?", 9, BLUE, "SemiBold")

    def mobile(self, x, name, mode="password", error=False):
        page = self.engine.page_id
        artboard = self.frame(page, name, x, 0, 390, 844, CANVAS)
        top = self.frame(artboard, "Mobile header", 12, 12, 366, 160, NAVY, 22)
        self.brand(top, 20, 20, dark=True, compact=True)
        self.text(top, "Mobile insight", 20, 86, 280, 25, "Pipeline minggu ini", 11, "#9FACC0", "SemiBold")
        self.text(top, "Mobile pipeline value", 20, 111, 190, 35, "Rp 428 jt", 24, WHITE, "Bold")
        chip = self.frame(top, "Mobile growth", 259, 102, 83, 32, "#173C37", 16)
        self.text(chip, "Mobile growth text", 14, 8, 62, 18, "+12%", 10, MINT, "Bold")

        self.password_form(artboard, 26, 220, 338, mode=mode, error=error, mobile=True)

    def specs(self):
        page = self.engine.page_id
        artboard = self.frame(page, "Design direction", 2810, 0, 980, 844, "#F7F8FC")
        self.text(artboard, "Specs title", 48, 48, 700, 44, "Modern CRM login system", 30, INK, "Bold")
        self.text(
            artboard,
            "Specs intro",
            48,
            102,
            720,
            46,
            "Arah visual yang menggabungkan rasa percaya, kecepatan, dan visibilitas pipeline.",
            13,
            MUTED,
            "Regular",
        )
        colors = [
            ("Midnight", NAVY),
            ("Action blue", BLUE),
            ("Warm coral", CORAL),
            ("Success mint", MINT),
            ("Canvas", CANVAS),
        ]
        for index, (label, color) in enumerate(colors):
            x = 48 + index * 170
            self.frame(artboard, f"Color {label}", x, 194, 142, 110, WHITE, 14, LINE)
            self.rect(artboard, f"Swatch {label}", x + 10, 204, 122, 54, color, 9)
            self.text(artboard, f"Label {label}", x + 12, 267, 118, 18, label, 10, INK, "SemiBold")
        principle = self.frame(artboard, "Design principles", 48, 350, 850, 386, NAVY, 22)
        self.text(principle, "Principles title", 28, 28, 350, 30, "Design principles", 20, WHITE, "Bold")
        rows = [
            ("01", "CRM sejak pandangan pertama", "Pipeline dan aktivitas memberi konteks sebelum pengguna masuk."),
            ("02", "Fokus yang terarah", "Satu bidang akses, satu tindakan utama, dan satu jalur alternatif."),
            ("03", "Modern yang tahan lama", "Kontras tegas, warna fungsional, dan radius yang mengikuti hierarki."),
        ]
        for index, (number, title, detail) in enumerate(rows):
            y = 92 + index * 92
            self.frame(principle, f"Principle {number}", 28, y, 54, 54, NAVY_3, 14)
            self.text(principle, f"Number {number}", 46, y + 15, 24, 22, number, 11, MINT, "Bold")
            self.text(principle, f"Title {number}", 104, y, 320, 24, title, 13, WHITE, "Bold")
            self.text(principle, f"Detail {number}", 104, y + 30, 670, 40, detail, 11, "#9FACC0", "Regular")

    def save(self, path):
        self.desktop()
        self.mobile(1496, "Mobile • Password")
        self.mobile(1942, "Mobile • API token", mode="token")
        self.mobile(2388, "Mobile • Error", error=True)
        self.specs()
        self.engine.save(path)


if __name__ == "__main__":
    design = LoginDesign()
    design.save("/Users/user/Documents/Jawad/DASHBOARD CRM/playdesign-crm-login-modern.figcraft")

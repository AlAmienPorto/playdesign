#!/usr/bin/env python3
"""
Comprehensive FigCraft Login UI Generator for Playdesign Office CRM.
Complies with Anti-Slop UI standards: clean neutral palette, Plus Jakarta Sans,
no emojis, balanced typography, elegant contrast, and crisp vector styling.
"""

import json
import os
import zipfile

def hex_c(h, a=1.0):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return {
        "r": round(int(h[0:2], 16) / 255.0, 5),
        "g": round(int(h[2:4], 16) / 255.0, 5),
        "b": round(int(h[4:6], 16) / 255.0, 5),
        "a": float(a),
    }

def solid_fill(hex_code, a=1.0):
    if not hex_code:
        return []
    return [{
        "type": "solid",
        "color": hex_c(hex_code, a),
        "opacity": float(a),
        "visible": True,
        "blend": "normal"
    }]

def stroke_style(hex_code, weight=1.0, align="inside", a=1.0):
    if not hex_code:
        return None
    return {
        "stroke": {
            "weight": float(weight),
            "align": align,
            "sides": None,
            "cap_start": "none",
            "cap_end": "none",
            "join": "miter",
            "miter_limit": 4.0,
            "dashes": [],
        },
        "strokes": [{
            "type": "solid",
            "color": hex_c(hex_code, a),
            "opacity": float(a),
            "visible": True,
            "blend": "normal"
        }]
    }

def corners(radius):
    r = float(radius)
    return {"radii": [r, r, r, r], "smoothing": 0.0}

class FigCraftDoc:
    def __init__(self, name="Playdesign CRM — Login & Auth Experience"):
        self.name = name
        self.next_id = 1
        self.nodes = {}
        self.page_id = self.alloc_id()
        self.page_children = []

        self.nodes[str(self.page_id)] = {
            "id": self.page_id,
            "name": "Playdesign Auth & Login",
            "type": "page",
            "background": hex_c("#090D14"),
            "flows": [],
            "prototype": {
                "device": "None",
                "background": hex_c("#090D14"),
                "rotation": "portrait"
            },
            "guides": [],
            "children": self.page_children,
            "width": 0.0,
            "height": 0.0
        }

    def alloc_id(self):
        nid = self.next_id
        self.next_id += 1
        return nid

    def add_node(self, node_dict):
        nid = node_dict["id"]
        self.nodes[str(nid)] = node_dict
        return nid

    def create_frame(self, name, parent_id, x, y, width, height, bg_hex=None, stroke_hex=None, stroke_w=1, radius=0, clip=True):
        fid = self.alloc_id()
        node = {
            "id": fid,
            "name": name,
            "type": "frame",
            "parent": parent_id,
            "children": [],
            "transform": [1.0, 0.0, 0.0, 1.0, float(x), float(y)],
            "width": float(width),
            "height": float(height),
            "fills": solid_fill(bg_hex) if bg_hex else [],
            "corners": corners(radius),
            "clip": clip,
        }
        if stroke_hex:
            s_data = stroke_style(stroke_hex, stroke_w)
            node["stroke"] = s_data["stroke"]
            node["strokes"] = s_data["strokes"]

        self.add_node(node)
        if str(parent_id) in self.nodes:
            self.nodes[str(parent_id)].setdefault("children", []).append(fid)
        elif parent_id == self.page_id:
            self.page_children.append(fid)
        return fid

    def create_rect(self, name, parent_id, x, y, width, height, bg_hex=None, stroke_hex=None, stroke_w=1, radius=0, opacity=1.0):
        rid = self.alloc_id()
        node = {
            "id": rid,
            "name": name,
            "type": "rectangle",
            "parent": parent_id,
            "blend": "normal",
            "transform": [1.0, 0.0, 0.0, 1.0, float(x), float(y)],
            "width": float(width),
            "height": float(height),
            "fills": solid_fill(bg_hex, opacity) if bg_hex else [],
            "corners": corners(radius),
        }
        if stroke_hex:
            s_data = stroke_style(stroke_hex, stroke_w)
            node["stroke"] = s_data["stroke"]
            node["strokes"] = s_data["strokes"]

        self.add_node(node)
        if str(parent_id) in self.nodes:
            self.nodes[str(parent_id)].setdefault("children", []).append(rid)
        return rid

    def create_text(self, name, parent_id, x, y, width, height, text, size=14, weight="Regular", color_hex="#FFFFFF", letter_spacing=0.0):
        tid = self.alloc_id()
        node = {
            "id": tid,
            "name": name,
            "type": "text",
            "parent": parent_id,
            "blend": "normal",
            "transform": [1.0, 0.0, 0.0, 1.0, float(x), float(y)],
            "width": float(width),
            "height": float(height),
            "characters": text,
            "style": {
                "font_family": "Plus Jakarta Sans",
                "font_style": weight,
                "font_size": float(size),
                "line_height": {"unit": "percent", "value": 140.0},
                "letter_spacing": {"unit": "percent", "value": float(letter_spacing)},
                "decoration": "none",
                "case": "original",
                "fills": None,
                "link": None
            },
            "fills": solid_fill(color_hex)
        }
        self.add_node(node)
        if str(parent_id) in self.nodes:
            self.nodes[str(parent_id)].setdefault("children", []).append(tid)
        return tid

    def save(self, file_path):
        doc = {
            "format": "figcraft",
            "version": 1,
            "imageIndex": [],
            "name": self.name,
            "pages": [self.page_id],
            "current_page": self.page_id,
            "next_id": self.next_id + 1,
            "styles": [],
            "variables": {"collections": [], "variables": []},
            "document_colors": [],
            "comments": [],
            "nodes": self.nodes,
        }
        os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
        with zipfile.ZipFile(file_path, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("document.json", json.dumps(doc, indent=2))
        print(f"[OK] Successfully built {file_path} ({os.path.getsize(file_path)} bytes)")


def build_screens():
    builder = FigCraftDoc()

    # =========================================================================
    # SCREEN 1: Desktop Login — Password Mode (1440 x 960)
    # =========================================================================
    s1 = builder.create_frame("Desktop Login — Password View", builder.page_id, 80, 80, 1440, 960, bg_hex="#0C101A", stroke_hex="#1E293B", stroke_w=1, radius=16)

    # Ambient Background elements
    builder.create_rect("Subtle Top Glow", s1, 0, 0, 1440, 4, bg_hex="#4F46E5")
    builder.create_rect("Vertical Divider", s1, 720, 80, 1, 800, bg_hex="#1E293B", opacity=0.8)

    # LEFT COLUMN: Brand & Ecosystem Showcase (x: 80, y: 120, w: 560)
    # Brand logo block
    logo_frame = builder.create_frame("Brand Logo Block", s1, 80, 100, 200, 44, bg_hex=None)
    builder.create_rect("Brand Mark", logo_frame, 0, 0, 42, 42, bg_hex="#4F46E5", stroke_hex="#6366F1", stroke_w=1, radius=12)
    builder.create_text("Logo P", logo_frame, 14, 8, 20, 26, "P", size=20, weight="Bold", color_hex="#FFFFFF")
    builder.create_text("Brand Title", logo_frame, 54, 4, 140, 20, "Playdesign OS", size=17, weight="Bold", color_hex="#F8FAFC")
    builder.create_text("Brand Sub", logo_frame, 54, 24, 140, 16, "Office CRM & Creative Hub", size=11, weight="Medium", color_hex="#94A3B8")

    # Main Headline
    builder.create_text("Left Headline", s1, 80, 180, 560, 84, "Satu Platform untuk Seluruh Operasional Kreatif & Bisnis", size=30, weight="Bold", color_hex="#F8FAFC")
    builder.create_text("Left Subtitle", s1, 80, 276, 540, 48, "Kelola pipeline prospek, siklus approval konten sosmed, otomasi video studio, dan integrasi Cloudflare D1 dalam satu sistem terpadu.", size=14, weight="Regular", color_hex="#94A3B8")

    # Showcase Cards Stack
    cards_data = [
        ("01", "Lead Scraper & Intelligence", "Scrape prospek Google Maps & enrichment antrean otomatis D1", "12.4k+ Leads", "#10B981", "#064E3B", 348),
        ("02", "Social Content Planner & Review", "Pratinjau layout multi-sosmed & alur revisi tim langsung", "88 Terjadwal", "#6366F1", "#312E81", 444),
        ("03", "Cloud Video Studio Remotion", "Render scene video otomatis & asisten revisi skrip berbasis AI", "4K Ready", "#38BDF8", "#0C4A6E", 540),
        ("04", "Landing Page & Public CMS", "Kelola halaman publik & company profile tanpa redeploy kode", "Live API", "#F59E0B", "#78350F", 636),
    ]

    for num, title, desc, tag, tag_color, tag_bg, y_pos in cards_data:
        c_frame = builder.create_frame(f"Card {title}", s1, 80, y_pos, 540, 80, bg_hex="#13192B", stroke_hex="#1E293B", stroke_w=1, radius=12)
        # Number badge
        builder.create_rect("Num Badge", c_frame, 16, 18, 44, 44, bg_hex="#1A2238", stroke_hex="#28354D", stroke_w=1, radius=10)
        builder.create_text("Num Text", c_frame, 28, 30, 24, 20, num, size=13, weight="Bold", color_hex="#818CF8")
        # Text details
        builder.create_text("Card Title", c_frame, 72, 18, 320, 20, title, size=14, weight="SemiBold", color_hex="#F1F5F9")
        builder.create_text("Card Desc", c_frame, 72, 42, 330, 18, desc, size=12, weight="Regular", color_hex="#94A3B8")
        # Right tag
        builder.create_rect("Tag Base", c_frame, 424, 26, 100, 28, bg_hex=tag_bg, radius=6)
        builder.create_text("Tag Text", c_frame, 434, 32, 80, 16, tag, size=11, weight="SemiBold", color_hex=tag_color)

    # Live Server Status Indicator at bottom left
    status_bar = builder.create_frame("Status Bar", s1, 80, 750, 540, 42, bg_hex="#0F1626", stroke_hex="#1E293B", stroke_w=1, radius=10)
    builder.create_rect("Dot Green", status_bar, 16, 17, 8, 8, bg_hex="#10B981", radius=4)
    builder.create_text("Status Text", status_bar, 32, 12, 480, 18, "Status Sistem: Aktif · Cloudflare Workers & D1 Database Terhubung", size=12, weight="Medium", color_hex="#94A3B8")


    # RIGHT COLUMN: Elevated Login Card (x: 820, y: 130, w: 480, h: 700)
    card_bg = builder.create_frame("Login Card Container", s1, 820, 130, 480, 700, bg_hex="#111726", stroke_hex="#222E46", stroke_w=1, radius=20)

    # Card Header
    builder.create_rect("Auth Pill Tag", card_bg, 40, 40, 140, 26, bg_hex="#1E1B4B", stroke_hex="#3730A3", stroke_w=1, radius=6)
    builder.create_text("Pill Text", card_bg, 50, 45, 120, 16, "WORKSPACE ACCESS", size=10, weight="Bold", color_hex="#818CF8", letter_spacing=0.5)

    builder.create_text("Card Title", card_bg, 40, 76, 400, 32, "Masuk ke Workspace", size=24, weight="Bold", color_hex="#F8FAFC")
    builder.create_text("Card Subtitle", card_bg, 40, 114, 400, 20, "Gunakan kredensial tim Anda untuk mengakses dashboard.", size=13, weight="Regular", color_hex="#94A3B8")

    # Segmented Switcher (Track 400 x 44 at x: 40, y: 150)
    track_s1 = builder.create_frame("Segmented Switcher", card_bg, 40, 150, 400, 44, bg_hex="#182032", stroke_hex="#242E42", stroke_w=1, radius=10)
    # Active tab: Password
    builder.create_rect("Tab Active Password", track_s1, 4, 4, 194, 36, bg_hex="#2A364F", stroke_hex="#3E4E70", stroke_w=1, radius=8)
    builder.create_text("Tab Pass Text", track_s1, 74, 13, 80, 18, "Password", size=13, weight="SemiBold", color_hex="#FFFFFF")
    # Inactive tab: API Token
    builder.create_text("Tab Token Text", track_s1, 264, 13, 80, 18, "API Token", size=13, weight="Medium", color_hex="#94A3B8")

    # Notice Alert Banner
    notice_s1 = builder.create_frame("Notice Banner", card_bg, 40, 210, 400, 52, bg_hex="#291E0A", stroke_hex="#854D0E", stroke_w=1, radius=10)
    builder.create_text("Notice Text", notice_s1, 16, 14, 368, 24, "Sesi aktif berlaku selama 30 hari di perangkat ini.", size=12, weight="Medium", color_hex="#FDE047")

    # Form Field: Password
    builder.create_text("Label Password", card_bg, 40, 282, 200, 18, "Password Workspace", size=13, weight="Medium", color_hex="#E2E8F0")

    input_pass = builder.create_frame("Input Box Password", card_bg, 40, 308, 400, 48, bg_hex="#161D2D", stroke_hex="#2A364F", stroke_w=1, radius=10)
    builder.create_text("Lock Icon Mock", input_pass, 14, 15, 20, 20, "[*]", size=12, weight="Bold", color_hex="#64748B")
    builder.create_text("Password Dots", input_pass, 44, 16, 280, 20, "••••••••••••••••••••", size=16, weight="Bold", color_hex="#F8FAFC")
    builder.create_text("Eye Toggle", input_pass, 344, 15, 42, 20, "Hide", size=11, weight="SemiBold", color_hex="#64748B")

    # Auxiliary Options: Checkbox & Forgot Password
    aux_row = builder.create_frame("Auxiliary Row", card_bg, 40, 372, 400, 24, bg_hex=None)
    builder.create_rect("Check Box", aux_row, 0, 3, 18, 18, bg_hex="#4F46E5", stroke_hex="#6366F1", stroke_w=1, radius=5)
    builder.create_text("Check Mark", aux_row, 4, 3, 12, 14, "v", size=11, weight="Bold", color_hex="#FFFFFF")
    builder.create_text("Remember Me", aux_row, 26, 3, 200, 18, "Ingat saya (30 hari)", size=12, weight="Regular", color_hex="#94A3B8")
    builder.create_text("Forgot Pass", aux_row, 300, 3, 100, 18, "Lupa password?", size=12, weight="SemiBold", color_hex="#818CF8")

    # Primary CTA Button
    btn_login = builder.create_frame("Primary Button", card_bg, 40, 416, 400, 50, bg_hex="#4F46E5", stroke_hex="#6366F1", stroke_w=1, radius=10)
    builder.create_text("Btn Text", btn_login, 130, 15, 160, 20, "Masuk ke Dashboard →", size=14, weight="Bold", color_hex="#FFFFFF")

    # Divider with label
    builder.create_rect("Line Left", card_bg, 40, 495, 120, 1, bg_hex="#222E46")
    builder.create_text("Or Divider", card_bg, 172, 486, 70, 18, "ATAU AKSES", size=11, weight="Bold", color_hex="#64748B")
    builder.create_rect("Line Right", card_bg, 252, 495, 188, 1, bg_hex="#222E46")

    # Secondary Action Button: API Token switch
    btn_sec = builder.create_frame("Secondary Button", card_bg, 40, 520, 400, 46, bg_hex="#161D2D", stroke_hex="#2A364F", stroke_w=1, radius=10)
    builder.create_text("Sec Text", btn_sec, 120, 14, 180, 20, "Gunakan API Token 64-Hex", size=13, weight="Medium", color_hex="#CBD5E1")

    # Security Footnote
    footer_card = builder.create_frame("Card Footer", card_bg, 40, 620, 400, 36, bg_hex=None)
    builder.create_rect("Shield Dot", footer_card, 40, 12, 10, 10, bg_hex="#10B981", radius=5)
    builder.create_text("Footer Sec Text", footer_card, 58, 8, 320, 18, "Enkripsi SHA-256 & Cloudflare Edge Verification", size=11, weight="Regular", color_hex="#64748B")


    # =========================================================================
    # SCREEN 2: Desktop Login — API Token Mode (1440 x 960)
    # =========================================================================
    s2 = builder.create_frame("Desktop Login — Token View", builder.page_id, 1600, 80, 1440, 960, bg_hex="#0C101A", stroke_hex="#1E293B", stroke_w=1, radius=16)

    builder.create_rect("Top Glow S2", s2, 0, 0, 1440, 4, bg_hex="#0284C7")
    builder.create_rect("Vertical Divider S2", s2, 720, 80, 1, 800, bg_hex="#1E293B", opacity=0.8)

    # Left Column (mirrored branding)
    logo_frame_2 = builder.create_frame("Brand Logo Block S2", s2, 80, 100, 200, 44, bg_hex=None)
    builder.create_rect("Brand Mark S2", logo_frame_2, 0, 0, 42, 42, bg_hex="#0284C7", stroke_hex="#38BDF8", stroke_w=1, radius=12)
    builder.create_text("Logo P S2", logo_frame_2, 14, 8, 20, 26, "P", size=20, weight="Bold", color_hex="#FFFFFF")
    builder.create_text("Brand Title S2", logo_frame_2, 54, 4, 140, 20, "Playdesign OS", size=17, weight="Bold", color_hex="#F8FAFC")
    builder.create_text("Brand Sub S2", logo_frame_2, 54, 24, 140, 16, "Automated API & CLI Access", size=11, weight="Medium", color_hex="#94A3B8")

    builder.create_text("Left Headline S2", s2, 80, 180, 560, 84, "Koneksi Langsung Mesin, Skrip Otomasi & Agent ke D1", size=30, weight="Bold", color_hex="#F8FAFC")
    builder.create_text("Left Subtitle S2", s2, 80, 276, 540, 48, "Metode autentikasi langsung menggunakan token 64 karakter hex untuk menjalankan runner scraper, sync data, atau integrasi CI/CD.", size=14, weight="Regular", color_hex="#94A3B8")

    # Developer Documentation Snippet Box
    code_box = builder.create_frame("Code Snippet Box", s2, 80, 360, 540, 220, bg_hex="#0F172A", stroke_hex="#1E293B", stroke_w=1, radius=12)
    builder.create_rect("Header Bar", code_box, 0, 0, 540, 36, bg_hex="#1E293B")
    builder.create_text("Bash Title", code_box, 16, 10, 200, 18, "bash — local dev token access", size=11, weight="SemiBold", color_hex="#94A3B8")
    builder.create_text("Code L1", code_box, 16, 52, 500, 20, "# Jalankan migrasi atau dapatkan token admin:", size=12, weight="Medium", color_hex="#64748B")
    builder.create_text("Code L2", code_box, 16, 78, 500, 20, "$ ./setup-access.sh --generate-token", size=13, weight="SemiBold", color_hex="#38BDF8")
    builder.create_text("Code L3", code_box, 16, 110, 500, 20, "Output: pd_sec_7a9f82d10c44e9b871fa28479e0132b4...", size=12, weight="Regular", color_hex="#10B981")
    builder.create_text("Code L4", code_box, 16, 144, 500, 20, "# Tempel token di sisi kanan untuk memulai sesi.", size=12, weight="Regular", color_hex="#64748B")

    # Right Card: Token Input
    card_token = builder.create_frame("Token Login Card", s2, 820, 130, 480, 700, bg_hex="#111726", stroke_hex="#222E46", stroke_w=1, radius=20)

    builder.create_rect("Token Pill Tag", card_token, 40, 40, 140, 26, bg_hex="#0C4A6E", stroke_hex="#0284C7", stroke_w=1, radius=6)
    builder.create_text("Token Pill Text", card_token, 52, 45, 120, 16, "DIRECT TOKEN GATE", size=10, weight="Bold", color_hex="#38BDF8", letter_spacing=0.5)

    builder.create_text("Token Title", card_token, 40, 76, 400, 32, "Masuk dengan API Token", size=24, weight="Bold", color_hex="#F8FAFC")
    builder.create_text("Token Subtitle", card_token, 40, 114, 400, 20, "Tempel token 64 hex untuk akses langsung ke backend Worker.", size=13, weight="Regular", color_hex="#94A3B8")

    # Segmented Switcher (Track with Token active)
    track_s2 = builder.create_frame("Segmented Switcher S2", card_token, 40, 150, 400, 44, bg_hex="#182032", stroke_hex="#242E42", stroke_w=1, radius=10)
    builder.create_text("Tab Pass Text S2", track_s2, 74, 13, 80, 18, "Password", size=13, weight="Medium", color_hex="#94A3B8")
    # Active tab: Token
    builder.create_rect("Tab Active Token", track_s2, 202, 4, 194, 36, bg_hex="#0284C7", stroke_hex="#38BDF8", stroke_w=1, radius=8)
    builder.create_text("Tab Token Text S2", track_s2, 264, 13, 80, 18, "API Token", size=13, weight="SemiBold", color_hex="#FFFFFF")

    # Notice Info Banner
    notice_s2 = builder.create_frame("Notice Banner S2", card_token, 40, 210, 400, 52, bg_hex="#082F49", stroke_hex="#0284C7", stroke_w=1, radius=10)
    builder.create_text("Notice S2 Text", notice_s2, 16, 14, 368, 24, "Kredensial divalidasi langsung ke Worker Cloudflare D1.", size=12, weight="Medium", color_hex="#38BDF8")

    # Form Field: Token Input
    builder.create_text("Label Token", card_token, 40, 282, 240, 18, "API Token (64-karakter hex)", size=13, weight="Medium", color_hex="#E2E8F0")

    input_token = builder.create_frame("Input Box Token", card_token, 40, 308, 400, 54, bg_hex="#161D2D", stroke_hex="#0284C7", stroke_w=1, radius=10)
    builder.create_text("Key Icon", input_token, 14, 18, 20, 20, "[K]", size=12, weight="Bold", color_hex="#38BDF8")
    builder.create_text("Token Value", input_token, 44, 18, 340, 20, "pd_sec_7a9f82d10c44e9b871fa28479e0132b4...", size=12, weight="Medium", color_hex="#F8FAFC")

    builder.create_text("Token Hint", card_token, 40, 372, 400, 18, "Pastikan token lengkap 64 karakter tanpa spasi.", size=11, weight="Regular", color_hex="#64748B")

    # Primary Button for Token
    btn_token = builder.create_frame("Primary Token Button", card_token, 40, 416, 400, 50, bg_hex="#0284C7", stroke_hex="#38BDF8", stroke_w=1, radius=10)
    builder.create_text("Btn Token Text", btn_token, 130, 15, 160, 20, "Verifikasi & Hubungkan →", size=14, weight="Bold", color_hex="#FFFFFF")

    # Back to Password
    btn_back_pass = builder.create_frame("Back to Pass Button", card_token, 40, 480, 400, 46, bg_hex="#161D2D", stroke_hex="#2A364F", stroke_w=1, radius=10)
    builder.create_text("Back Text", btn_back_pass, 130, 14, 180, 20, "Kembali ke Login Password", size=13, weight="Medium", color_hex="#CBD5E1")


    # =========================================================================
    # SCREEN 3: Mobile Login View — iPhone 16 (390 x 844)
    # =========================================================================
    s3 = builder.create_frame("Mobile Login — iPhone 16", builder.page_id, 3120, 80, 390, 844, bg_hex="#0C101A", stroke_hex="#222E46", stroke_w=2, radius=44)

    # Dynamic Island
    builder.create_rect("Dynamic Island", s3, 135, 11, 120, 32, bg_hex="#000000", radius=16)

    # iOS Status Bar Elements
    builder.create_text("iOS Time", s3, 36, 16, 40, 18, "9:41", size=14, weight="SemiBold", color_hex="#FFFFFF")
    builder.create_text("iOS Icons", s3, 310, 16, 50, 18, "5G [B]", size=12, weight="Medium", color_hex="#FFFFFF")

    # Mobile Header
    builder.create_rect("Mobile Logo", s3, 24, 76, 38, 38, bg_hex="#4F46E5", stroke_hex="#6366F1", stroke_w=1, radius=10)
    builder.create_text("Mobile Logo P", s3, 37, 84, 20, 20, "P", size=18, weight="Bold", color_hex="#FFFFFF")
    builder.create_text("Mobile Brand", s3, 72, 76, 200, 20, "Playdesign CRM", size=16, weight="Bold", color_hex="#F8FAFC")
    builder.create_text("Mobile Sub", s3, 72, 98, 200, 16, "Cloudflare D1 Workspace", size=11, weight="Medium", color_hex="#94A3B8")

    # Mobile Main Title
    builder.create_text("Mobile Headline", s3, 24, 140, 342, 28, "Masuk ke Workspace", size=22, weight="Bold", color_hex="#F8FAFC")
    builder.create_text("Mobile Desc", s3, 24, 172, 342, 36, "Akses dashboard CRM, review konten, dan leads langsung dari perangkat mobile.", size=12, weight="Regular", color_hex="#94A3B8")

    # Mobile Segmented Switcher (342 x 38 at x: 24, y: 226)
    m_track = builder.create_frame("Mobile Switcher", s3, 24, 226, 342, 38, bg_hex="#182032", stroke_hex="#242E42", stroke_w=1, radius=8)
    builder.create_rect("Mobile Active Tab", m_track, 3, 3, 166, 32, bg_hex="#2A364F", radius=6)
    builder.create_text("M Tab 1", m_track, 62, 10, 60, 16, "Password", size=12, weight="SemiBold", color_hex="#FFFFFF")
    builder.create_text("M Tab 2", m_track, 228, 10, 60, 16, "API Token", size=12, weight="Medium", color_hex="#94A3B8")

    # Mobile Notice
    m_notice = builder.create_frame("Mobile Notice", s3, 24, 280, 342, 44, bg_hex="#291E0A", stroke_hex="#854D0E", stroke_w=1, radius=8)
    builder.create_text("M Notice Text", m_notice, 12, 12, 318, 20, "Sesi aktif tersimpan aman selama 30 hari.", size=11, weight="Medium", color_hex="#FDE047")

    # Mobile Password Input
    builder.create_text("M Label Pass", s3, 24, 342, 200, 16, "Password Workspace", size=12, weight="Medium", color_hex="#E2E8F0")
    m_input = builder.create_frame("Mobile Input Box", s3, 24, 366, 342, 46, bg_hex="#161D2D", stroke_hex="#2A364F", stroke_w=1, radius=10)
    builder.create_text("M Input Dots", m_input, 16, 15, 240, 20, "••••••••••••••••", size=15, weight="Bold", color_hex="#F8FAFC")
    builder.create_text("M Input Hide", m_input, 296, 15, 36, 18, "Hide", size=11, weight="SemiBold", color_hex="#64748B")

    # Mobile Checkbox row
    m_aux = builder.create_frame("Mobile Aux Row", s3, 24, 426, 342, 20, bg_hex=None)
    builder.create_rect("M Check", m_aux, 0, 2, 16, 16, bg_hex="#4F46E5", radius=4)
    builder.create_text("M Check V", m_aux, 4, 2, 10, 12, "v", size=9, weight="Bold", color_hex="#FFFFFF")
    builder.create_text("M Rem", m_aux, 24, 2, 180, 16, "Ingat saya (30 hari)", size=11, weight="Regular", color_hex="#94A3B8")
    builder.create_text("M Forgot", m_aux, 248, 2, 94, 16, "Lupa password?", size=11, weight="SemiBold", color_hex="#818CF8")

    # Mobile Primary CTA
    m_cta = builder.create_frame("Mobile CTA Button", s3, 24, 470, 342, 48, bg_hex="#4F46E5", stroke_hex="#6366F1", stroke_w=1, radius=12)
    builder.create_text("M CTA Text", m_cta, 110, 14, 160, 20, "Masuk Sekarang →", size=14, weight="Bold", color_hex="#FFFFFF")

    # Mobile Secondary Ghost Button
    m_sec = builder.create_frame("Mobile Sec Button", s3, 24, 530, 342, 44, bg_hex="#161D2D", stroke_hex="#242E42", stroke_w=1, radius=10)
    builder.create_text("M Sec Text", m_sec, 100, 13, 160, 20, "Masuk dengan API Token", size=12, weight="Medium", color_hex="#CBD5E1")

    # Mobile Footer Info
    builder.create_text("M Footer", s3, 24, 730, 342, 18, "Protected by Cloudflare Workers & D1 Auth", size=10, weight="Regular", color_hex="#64748B")

    # iOS Home Indicator
    builder.create_rect("iOS Home Bar", s3, 125, 828, 140, 5, bg_hex="#FFFFFF", radius=3)

    return builder


if __name__ == "__main__":
    out_file = "/Users/user/Documents/Jawad/DASHBOARD CRM/playdesign-login.figcraft"
    b = build_screens()
    b.save(out_file)

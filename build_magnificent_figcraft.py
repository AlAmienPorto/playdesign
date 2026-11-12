#!/usr/bin/env python3
"""
Magnificent FigCraft Design System & Login UI Generator for Playdesign Office CRM.
Constructs 4 complete artboards:
1. Desktop Luxury Dark (1440x960) with floating interactive CRM widgets
2. Desktop Studio Light (1440x960) with Apple/Linear aesthetic
3. Mobile iPhone 16 Pro (390x844) with dynamic island & biometric option
4. Design Tokens & Component Anatomy (960x640)
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

class FigCraftEngine:
    def __init__(self, name="Playdesign CRM — Master Design System & Login Experience"):
        self.name = name
        self.next_id = 1
        self.nodes = {}
        self.page_id = self.alloc_id()
        self.page_children = []

        self.nodes[str(self.page_id)] = {
            "id": self.page_id,
            "name": "Playdesign Design System",
            "type": "page",
            "background": hex_c("#06080F"),
            "flows": [],
            "prototype": {
                "device": "None",
                "background": hex_c("#06080F"),
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

    def create_frame(self, name, parent_id, x, y, width, height, bg_hex=None, stroke_hex=None, stroke_w=1, radius=0, clip=True, opacity=1.0):
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
            "fills": solid_fill(bg_hex, opacity) if bg_hex else [],
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


def generate_all_artboards():
    eng = FigCraftEngine()

    # =========================================================================
    # ARTBOARD 1: Desktop Luxury Dark (1440 x 960)
    # =========================================================================
    s1 = eng.create_frame("01 · Desktop Luxury Dark", eng.page_id, 80, 80, 1440, 960, bg_hex="#070A11", stroke_hex="#1E293B", stroke_w=1, radius=20)

    # Ambient Top Glow Strip
    eng.create_rect("Top Accent Line", s1, 0, 0, 1440, 3, bg_hex="#4F46E5")
    eng.create_rect("Subtle Ambient Card", s1, 60, 60, 1320, 840, bg_hex="#0B0F19", stroke_hex="#162032", stroke_w=1, radius=20)

    # Top Brand Navigation Inside Frame
    top_nav = eng.create_frame("Top Navigation", s1, 90, 85, 1260, 52, bg_hex=None)
    # Brand Identity
    eng.create_rect("Logo Box", top_nav, 0, 6, 40, 40, bg_hex="#4F46E5", stroke_hex="#6366F1", stroke_w=1, radius=10)
    eng.create_text("Logo P", top_nav, 13, 14, 16, 22, "P", size=18, weight="Bold", color_hex="#FFFFFF")
    eng.create_text("Brand Title", top_nav, 50, 11, 140, 20, "Playdesign OS", size=16, weight="Bold", color_hex="#F8FAFC")
    eng.create_text("Brand Meta", top_nav, 50, 30, 140, 14, "Enterprise CRM · v2.4", size=10, weight="Medium", color_hex="#818CF8")

    # Right System Badge
    sys_pill = eng.create_frame("System Status Pill", top_nav, 940, 10, 320, 32, bg_hex="#101827", stroke_hex="#1F2A3D", stroke_w=1, radius=20)
    eng.create_rect("Pulse Dot", sys_pill, 14, 12, 8, 8, bg_hex="#10B981", radius=4)
    eng.create_text("Status Label", sys_pill, 30, 8, 280, 16, "Cloudflare D1 Active · SIN/CGK Edge 18ms", size=11, weight="Medium", color_hex="#94A3B8")

    # Left Section: Hero + Live Interactive Floating Widgets (x: 100, y: 160, w: 600)
    eng.create_rect("Tag Kicker", s1, 100, 165, 180, 24, bg_hex="#1E1B4B", stroke_hex="#3730A3", stroke_w=1, radius=6)
    eng.create_text("Kicker Text", s1, 112, 170, 160, 14, "CREATIVE OPERATING SYSTEM", size=9, weight="Bold", color_hex="#818CF8", letter_spacing=0.8)

    eng.create_text("Main Title", s1, 100, 204, 560, 84, "Kendalikan Seluruh Operasional Kreatif & Klien dari Satu Tempat", size=29, weight="Bold", color_hex="#F8FAFC")
    eng.create_text("Main Desc", s1, 100, 296, 540, 48, "Satu platform untuk scraping prospek B2B terverifikasi, review konten multi-klien, dan otomatisasi video rendering berbasis D1 Cloudflare.", size=13, weight="Regular", color_hex="#94A3B8")

    # 3 FLOATING INTERACTIVE MOCKUP CARDS (Layered visual depth!)
    # Floating Card 1: Live Inbound Lead (x: 100, y: 360, w: 480, h: 88)
    fc1 = eng.create_frame("Widget 1: Inbound Lead", s1, 100, 360, 490, 86, bg_hex="#111827", stroke_hex="#222F44", stroke_w=1, radius=14)
    eng.create_rect("Avatar Lead", fc1, 16, 16, 42, 42, bg_hex="#1E293B", stroke_hex="#334155", stroke_w=1, radius=10)
    eng.create_text("Avatar Init", fc1, 26, 28, 24, 18, "KH", size=13, weight="Bold", color_hex="#38BDF8")
    eng.create_text("Lead Name", fc1, 70, 16, 240, 20, "Kopi Harian Nusantara", size=14, weight="SemiBold", color_hex="#F8FAFC")
    eng.create_text("Lead Sub", fc1, 70, 38, 240, 16, "F&B / Kafe · Semarang · Terverifikasi GMaps", size=11, weight="Regular", color_hex="#94A3B8")
    eng.create_text("Lead Rating", fc1, 70, 56, 160, 14, "★ 4.9 (148 ulasan) · Confidence 94%", size=10, weight="Medium", color_hex="#10B981")
    # Quick action pill
    eng.create_rect("WA Action Pill", fc1, 350, 26, 124, 32, bg_hex="#064E3B", stroke_hex="#059669", stroke_w=1, radius=8)
    eng.create_text("WA Action Text", fc1, 362, 34, 104, 16, "WhatsApp PIC →", size=11, weight="SemiBold", color_hex="#34D399")

    # Floating Card 2: Content Approval Matrix (x: 140, y: 465, w: 490, h: 92) - Offset for depth!
    fc2 = eng.create_frame("Widget 2: Content Matrix", s1, 140, 465, 490, 92, bg_hex="#131B2E", stroke_hex="#2A3854", stroke_w=1, radius=14)
    eng.create_rect("Post Thumb", fc2, 16, 16, 60, 60, bg_hex="#1E1B4B", stroke_hex="#4338CA", stroke_w=1, radius=10)
    eng.create_text("Thumb Icon", fc2, 28, 36, 36, 18, "[IMG]", size=11, weight="Bold", color_hex="#A5B4FC")
    eng.create_text("Post Title", fc2, 88, 16, 260, 20, "Peluncuran Menu Baru — Carousel 5 Slide", size=13, weight="SemiBold", color_hex="#F8FAFC")
    eng.create_text("Post Schedule", fc2, 88, 38, 250, 16, "Instagram Feed · Terjadwal Besok 10:00 WIB", size=11, weight="Regular", color_hex="#94A3B8")
    eng.create_rect("Approved Tag", fc2, 88, 58, 140, 22, bg_hex="#064E3B", radius=4)
    eng.create_text("Approved Text", fc2, 96, 62, 126, 14, "✓ Approved by Creative", size=10, weight="Bold", color_hex="#10B981")

    # Floating Card 3: Video Studio Render (x: 100, y: 575, w: 490, h: 84)
    fc3 = eng.create_frame("Widget 3: Video Render", s1, 100, 575, 490, 84, bg_hex="#111827", stroke_hex="#222F44", stroke_w=1, radius=14)
    eng.create_rect("Video Icon Box", fc3, 16, 18, 44, 44, bg_hex="#082F49", stroke_hex="#0284C7", stroke_w=1, radius=10)
    eng.create_text("Play Icon", fc3, 31, 31, 16, 18, "▶", size=13, weight="Bold", color_hex="#38BDF8")
    eng.create_text("Video Title", fc3, 72, 16, 260, 20, "Reel_Promo_Launch_1080p.mp4", size=13, weight="SemiBold", color_hex="#F8FAFC")
    eng.create_text("Video Meta", fc3, 72, 36, 260, 16, "Remotion Cloud Engine · 1080x1920 · 24fps", size=11, weight="Regular", color_hex="#94A3B8")
    # Progress Bar
    eng.create_rect("Progress Track", fc3, 72, 58, 260, 6, bg_hex="#1F293D", radius=3)
    eng.create_rect("Progress Fill", fc3, 72, 58, 214, 6, bg_hex="#38BDF8", radius=3)
    eng.create_text("Progress Percent", fc3, 342, 52, 50, 16, "82%", size=11, weight="Bold", color_hex="#38BDF8")

    # KPI Counter Strip at Bottom Left (x: 100, y: 685, w: 530, h: 72)
    kpi_bar = eng.create_frame("KPI Counter Strip", s1, 100, 685, 530, 72, bg_hex="#0E1524", stroke_hex="#1C273C", stroke_w=1, radius=12)
    # KPI 1
    eng.create_text("KPI 1 Val", kpi_bar, 20, 14, 140, 24, "Rp 1.48 M", size=18, weight="Bold", color_hex="#FFFFFF")
    eng.create_text("KPI 1 Lbl", kpi_bar, 20, 40, 140, 16, "Pipeline Aktif CRM", size=11, weight="Medium", color_hex="#64748B")
    eng.create_rect("KPI Div 1", kpi_bar, 175, 14, 1, 44, bg_hex="#1E293B")
    # KPI 2
    eng.create_text("KPI 2 Val", kpi_bar, 195, 14, 140, 24, "12,450", size=18, weight="Bold", color_hex="#10B981")
    eng.create_text("KPI 2 Lbl", kpi_bar, 195, 40, 140, 16, "Leads Terverifikasi", size=11, weight="Medium", color_hex="#64748B")
    eng.create_rect("KPI Div 2", kpi_bar, 350, 14, 1, 44, bg_hex="#1E293B")
    # KPI 3
    eng.create_text("KPI 3 Val", kpi_bar, 370, 14, 140, 24, "99.98%", size=18, weight="Bold", color_hex="#38BDF8")
    eng.create_text("KPI 3 Lbl", kpi_bar, 370, 40, 140, 16, "Uptime Worker D1", size=11, weight="Medium", color_hex="#64748B")


    # RIGHT COLUMN: The Masterpiece Elevated Login Card (x: 820, y: 145, w: 480, h: 710)
    card_bg = eng.create_frame("Master Login Card", s1, 820, 145, 480, 710, bg_hex="#0F1626", stroke_hex="#223048", stroke_w=1, radius=24)

    # Top Gradient Accent inside card
    eng.create_rect("Card Top Glow", card_bg, 0, 0, 480, 3, bg_hex="#4F46E5")

    # Inside Card Header
    eng.create_rect("Lock Icon Badge", card_bg, 40, 36, 44, 44, bg_hex="#182238", stroke_hex="#2E3F61", stroke_w=1, radius=12)
    eng.create_text("Lock Emoji", card_bg, 54, 48, 16, 20, "[*]", size=13, weight="Bold", color_hex="#818CF8")
    eng.create_text("Card Title", card_bg, 96, 36, 320, 24, "Masuk ke Workspace", size=22, weight="Bold", color_hex="#F8FAFC")
    eng.create_text("Card Sub", card_bg, 96, 60, 320, 18, "Pilih metode autentikasi untuk mengakses data tim.", size=12, weight="Regular", color_hex="#94A3B8")

    # Segmented Switcher (Track 400 x 44 at x: 40, y: 104)
    track_s1 = eng.create_frame("Segmented Switcher", card_bg, 40, 104, 400, 44, bg_hex="#141D2E", stroke_hex="#222E46", stroke_w=1, radius=10)
    # Active tab: Password
    eng.create_rect("Active Pill Pass", track_s1, 4, 4, 194, 36, bg_hex="#263554", stroke_hex="#3B4F7A", stroke_w=1, radius=8)
    eng.create_text("Tab Pass Text", track_s1, 56, 13, 100, 18, "Password Tim", size=13, weight="SemiBold", color_hex="#FFFFFF")
    # Inactive tab: Token
    eng.create_text("Tab Token Text", track_s1, 246, 13, 110, 18, "API Token 64-Hex", size=13, weight="Medium", color_hex="#94A3B8")

    # Notice Alert Banner
    notice_s1 = eng.create_frame("Notice Banner", card_bg, 40, 162, 400, 48, bg_hex="#241B09", stroke_hex="#78350F", stroke_w=1, radius=10)
    eng.create_rect("Shield Mini", notice_s1, 14, 16, 14, 14, bg_hex="#F59E0B", radius=4)
    eng.create_text("Notice Text", notice_s1, 36, 14, 350, 20, "Sesi aktif aman selama 30 hari di perangkat ini.", size=12, weight="Medium", color_hex="#FDE047")

    # Form Field: Password
    eng.create_text("Label Password", card_bg, 40, 226, 200, 16, "PASSWORD WORKSPACE", size=11, weight="Bold", color_hex="#CBD5E1", letter_spacing=0.5)

    input_pass = eng.create_frame("Input Box Password", card_bg, 40, 250, 400, 50, bg_hex="#131B2D", stroke_hex="#2B3C5E", stroke_w=1, radius=12)
    eng.create_text("Lock Prefix", input_pass, 16, 16, 20, 20, "[*]", size=12, weight="Bold", color_hex="#64748B")
    eng.create_text("Bullets", input_pass, 44, 16, 260, 20, "••••••••••••••••••••", size=16, weight="Bold", color_hex="#F8FAFC")
    # Password strength badge inside input
    eng.create_rect("Strength Pill", input_pass, 310, 14, 42, 22, bg_hex="#064E3B", radius=4)
    eng.create_text("Strength Text", input_pass, 316, 17, 30, 14, "Kuat", size=10, weight="Bold", color_hex="#10B981")
    eng.create_text("Eye Toggle", input_pass, 362, 16, 30, 18, "[O]", size=11, weight="Bold", color_hex="#64748B")

    # Auxiliary Options: Checkbox & Forgot Password
    aux_row = eng.create_frame("Auxiliary Row", card_bg, 40, 314, 400, 24, bg_hex=None)
    eng.create_rect("Check Box", aux_row, 0, 3, 18, 18, bg_hex="#4F46E5", stroke_hex="#6366F1", stroke_w=1, radius=5)
    eng.create_text("Check Mark", aux_row, 4, 3, 12, 14, "✓", size=11, weight="Bold", color_hex="#FFFFFF")
    eng.create_text("Remember Me", aux_row, 26, 3, 220, 18, "Ingat sesi saya di browser ini (30 hari)", size=12, weight="Regular", color_hex="#94A3B8")
    eng.create_text("Forgot Pass", aux_row, 300, 3, 100, 18, "Lupa password?", size=12, weight="SemiBold", color_hex="#818CF8")

    # Primary CTA Button: High Impact Gradient Indigo
    btn_login = eng.create_frame("Primary Button", card_bg, 40, 356, 400, 52, bg_hex="#4F46E5", stroke_hex="#6366F1", stroke_w=1, radius=12)
    eng.create_text("Btn Text", btn_login, 120, 16, 160, 20, "Buka Workspace CRM →", size=14, weight="Bold", color_hex="#FFFFFF")
    eng.create_text("Btn Shortcut", btn_login, 340, 17, 44, 18, "↵ Enter", size=10, weight="SemiBold", color_hex="#A5B4FC")

    # Alternative SSO Section
    eng.create_rect("Divider Left", card_bg, 40, 436, 120, 1, bg_hex="#1E293B")
    eng.create_text("Divider Or", card_bg, 172, 428, 70, 16, "ATAU MASUK", size=10, weight="Bold", color_hex="#64748B")
    eng.create_rect("Divider Right", card_bg, 252, 436, 188, 1, bg_hex="#1E293B")

    # Google Workspace SSO Button
    sso_btn = eng.create_frame("Google SSO Button", card_bg, 40, 460, 400, 46, bg_hex="#131B2D", stroke_hex="#222F48", stroke_w=1, radius=10)
    eng.create_rect("G Box", sso_btn, 14, 12, 22, 22, bg_hex="#FFFFFF", radius=4)
    eng.create_text("G Text", sso_btn, 20, 13, 12, 18, "G", size=13, weight="Bold", color_hex="#EA4335")
    eng.create_text("SSO Label", sso_btn, 50, 14, 280, 18, "Lanjutkan dengan Google Workspace", size=13, weight="Medium", color_hex="#E2E8F0")

    # Token Access Fast Toggle
    token_toggle = eng.create_frame("Token Fast Button", card_bg, 40, 518, 400, 46, bg_hex="#131B2D", stroke_hex="#222F48", stroke_w=1, radius=10)
    eng.create_text("Token Fast Label", token_toggle, 110, 14, 200, 18, "Gunakan API Token 64-Hex", size=13, weight="Medium", color_hex="#94A3B8")

    # Security Footnote Card
    sec_foot = eng.create_frame("Security Footnote", card_bg, 40, 620, 400, 50, bg_hex="#0B101D", stroke_hex="#182236", stroke_w=1, radius=10)
    eng.create_rect("Shield Green Dot", sec_foot, 16, 16, 8, 8, bg_hex="#10B981", radius=4)
    eng.create_text("Sec Text 1", sec_foot, 32, 12, 350, 16, "Enkripsi End-to-End dengan Cloudflare Workers & D1", size=11, weight="SemiBold", color_hex="#CBD5E1")
    eng.create_text("Sec Text 2", sec_foot, 32, 28, 350, 14, "Validasi kredensial real-time · Token tidak pernah terekspos", size=10, weight="Regular", color_hex="#64748B")


    # =========================================================================
    # ARTBOARD 2: Desktop Studio Light (1440 x 960) — Apple / Linear Aesthetic
    # =========================================================================
    s2 = eng.create_frame("02 · Desktop Studio Light", eng.page_id, 1600, 80, 1440, 960, bg_hex="#F8FAFC", stroke_hex="#E2E8F0", stroke_w=1, radius=20)

    eng.create_rect("Top Blue Accent S2", s2, 0, 0, 1440, 4, bg_hex="#4F46E5")
    eng.create_rect("Subtle Ambient Card S2", s2, 60, 60, 1320, 840, bg_hex="#F1F5F9", stroke_hex="#E2E8F0", stroke_w=1, radius=20)

    # Top Nav Light
    top_nav_2 = eng.create_frame("Top Nav Light", s2, 90, 85, 1260, 52, bg_hex=None)
    eng.create_rect("Logo Box S2", top_nav_2, 0, 6, 40, 40, bg_hex="#4F46E5", stroke_hex="#4338CA", stroke_w=1, radius=10)
    eng.create_text("Logo P S2", top_nav_2, 13, 14, 16, 22, "P", size=18, weight="Bold", color_hex="#FFFFFF")
    eng.create_text("Brand Title S2", top_nav_2, 50, 11, 140, 20, "Playdesign OS", size=16, weight="Bold", color_hex="#0F172A")
    eng.create_text("Brand Meta S2", top_nav_2, 50, 30, 140, 14, "Studio Edition · Light UI", size=10, weight="Medium", color_hex="#64748B")

    # Left Column Light
    eng.create_rect("Tag Kicker S2", s2, 100, 165, 180, 24, bg_hex="#EEF2FF", stroke_hex="#C7D2FE", stroke_w=1, radius=6)
    eng.create_text("Kicker Text S2", s2, 112, 170, 160, 14, "CREATIVE OPERATING SYSTEM", size=9, weight="Bold", color_hex="#4F46E5", letter_spacing=0.8)

    eng.create_text("Main Title S2", s2, 100, 204, 560, 84, "Kendalikan Seluruh Operasional Kreatif & Klien dari Satu Tempat", size=29, weight="Bold", color_hex="#0F172A")
    eng.create_text("Main Desc S2", s2, 100, 296, 540, 48, "Satu platform untuk scraping prospek B2B terverifikasi, review konten multi-klien, dan otomatisasi video rendering berbasis D1 Cloudflare.", size=13, weight="Regular", color_hex="#475569")

    # Light Widgets
    lc1 = eng.create_frame("Light Widget 1", s2, 100, 360, 490, 86, bg_hex="#FFFFFF", stroke_hex="#E2E8F0", stroke_w=1, radius=14)
    eng.create_rect("Avatar L1", lc1, 16, 16, 42, 42, bg_hex="#EEF2FF", stroke_hex="#E0E7FF", stroke_w=1, radius=10)
    eng.create_text("Init L1", lc1, 26, 28, 24, 18, "KH", size=13, weight="Bold", color_hex="#4F46E5")
    eng.create_text("Name L1", lc1, 70, 16, 240, 20, "Kopi Harian Nusantara", size=14, weight="SemiBold", color_hex="#0F172A")
    eng.create_text("Sub L1", lc1, 70, 38, 240, 16, "F&B / Kafe · Semarang · Terverifikasi GMaps", size=11, weight="Regular", color_hex="#64748B")
    eng.create_text("Rating L1", lc1, 70, 56, 160, 14, "★ 4.9 (148 ulasan) · Confidence 94%", size=10, weight="Medium", color_hex="#059669")
    eng.create_rect("WA Action L1", lc1, 350, 26, 124, 32, bg_hex="#ECFDF5", stroke_hex="#A7F3D0", stroke_w=1, radius=8)
    eng.create_text("WA Text L1", lc1, 362, 34, 104, 16, "WhatsApp PIC →", size=11, weight="SemiBold", color_hex="#059669")

    lc2 = eng.create_frame("Light Widget 2", s2, 140, 465, 490, 92, bg_hex="#FFFFFF", stroke_hex="#E2E8F0", stroke_w=1, radius=14)
    eng.create_rect("Thumb L2", lc2, 16, 16, 60, 60, bg_hex="#EEF2FF", stroke_hex="#C7D2FE", stroke_w=1, radius=10)
    eng.create_text("Thumb Icon L2", lc2, 28, 36, 36, 18, "[IMG]", size=11, weight="Bold", color_hex="#4F46E5")
    eng.create_text("Title L2", lc2, 88, 16, 260, 20, "Peluncuran Menu Baru — Carousel 5 Slide", size=13, weight="SemiBold", color_hex="#0F172A")
    eng.create_text("Sched L2", lc2, 88, 38, 250, 16, "Instagram Feed · Terjadwal Besok 10:00 WIB", size=11, weight="Regular", color_hex="#64748B")
    eng.create_rect("App Tag L2", lc2, 88, 58, 140, 22, bg_hex="#ECFDF5", radius=4)
    eng.create_text("App Text L2", lc2, 96, 62, 126, 14, "✓ Approved by Creative", size=10, weight="Bold", color_hex="#059669")

    # Light Login Card (Pure White)
    card_light = eng.create_frame("Master Login Card Light", s2, 820, 145, 480, 710, bg_hex="#FFFFFF", stroke_hex="#E2E8F0", stroke_w=1, radius=24)
    eng.create_rect("Card Top Glow L", card_light, 0, 0, 480, 3, bg_hex="#4F46E5")

    eng.create_rect("Lock Icon Badge L", card_light, 40, 36, 44, 44, bg_hex="#EEF2FF", stroke_hex="#C7D2FE", stroke_w=1, radius=12)
    eng.create_text("Lock Emoji L", card_light, 54, 48, 16, 20, "[*]", size=13, weight="Bold", color_hex="#4F46E5")
    eng.create_text("Card Title L", card_light, 96, 36, 320, 24, "Masuk ke Workspace", size=22, weight="Bold", color_hex="#0F172A")
    eng.create_text("Card Sub L", card_light, 96, 60, 320, 18, "Pilih metode autentikasi untuk mengakses data tim.", size=12, weight="Regular", color_hex="#64748B")

    # Segmented Switcher Light
    track_s2 = eng.create_frame("Switcher Light", card_light, 40, 104, 400, 44, bg_hex="#F1F5F9", stroke_hex="#E2E8F0", stroke_w=1, radius=10)
    eng.create_rect("Active Pill Light", track_s2, 4, 4, 194, 36, bg_hex="#FFFFFF", stroke_hex="#CBD5E1", stroke_w=1, radius=8)
    eng.create_text("Tab Pass Text L", track_s2, 56, 13, 100, 18, "Password Tim", size=13, weight="SemiBold", color_hex="#0F172A")
    eng.create_text("Tab Token Text L", track_s2, 246, 13, 110, 18, "API Token 64-Hex", size=13, weight="Medium", color_hex="#64748B")

    # Light Input Box
    eng.create_text("Label Password L", card_light, 40, 226, 200, 16, "PASSWORD WORKSPACE", size=11, weight="Bold", color_hex="#475569", letter_spacing=0.5)
    input_pass_l = eng.create_frame("Input Box Pass L", card_light, 40, 250, 400, 50, bg_hex="#F8FAFC", stroke_hex="#CBD5E1", stroke_w=1, radius=12)
    eng.create_text("Bullets L", input_pass_l, 44, 16, 260, 20, "••••••••••••••••••••", size=16, weight="Bold", color_hex="#0F172A")

    # CTA Button Dark Indigo
    btn_login_l = eng.create_frame("Primary Button L", card_light, 40, 356, 400, 52, bg_hex="#0F172A", stroke_hex="#334155", stroke_w=1, radius=12)
    eng.create_text("Btn Text L", btn_login_l, 120, 16, 160, 20, "Buka Workspace CRM →", size=14, weight="Bold", color_hex="#FFFFFF")


    # =========================================================================
    # ARTBOARD 3: Mobile Experience — iPhone 16 Pro (390 x 844)
    # =========================================================================
    s3 = eng.create_frame("03 · Mobile iPhone 16 Pro", eng.page_id, 3120, 80, 390, 844, bg_hex="#070A11", stroke_hex="#222F46", stroke_w=3, radius=48)

    # Dynamic Island
    eng.create_rect("Dynamic Island Notch", s3, 135, 12, 120, 32, bg_hex="#000000", radius=16)

    # iOS Status Bar
    eng.create_text("iOS Clock", s3, 36, 16, 40, 18, "9:41", size=14, weight="SemiBold", color_hex="#FFFFFF")
    eng.create_text("iOS Top Icons", s3, 305, 16, 55, 18, "5G [100%]", size=11, weight="SemiBold", color_hex="#FFFFFF")

    # Mobile Brand & Header
    eng.create_rect("Mobile Logo Box", s3, 24, 76, 40, 40, bg_hex="#4F46E5", stroke_hex="#6366F1", stroke_w=1, radius=10)
    eng.create_text("M Logo P", s3, 38, 86, 16, 20, "P", size=18, weight="Bold", color_hex="#FFFFFF")
    eng.create_text("M Brand", s3, 74, 76, 200, 20, "Playdesign OS", size=17, weight="Bold", color_hex="#F8FAFC")
    eng.create_text("M Sub", s3, 74, 98, 200, 14, "Mobile Workspace Gate", size=11, weight="Medium", color_hex="#818CF8")

    eng.create_text("M Headline", s3, 24, 140, 342, 28, "Masuk ke Workspace", size=22, weight="Bold", color_hex="#F8FAFC")
    eng.create_text("M Subtitle", s3, 24, 172, 342, 36, "Akses antrean leads, approval konten, dan metrik langsung dari smartphone Anda.", size=12, weight="Regular", color_hex="#94A3B8")

    # Mobile Segmented Switcher
    m_track = eng.create_frame("Mobile Switcher Track", s3, 24, 226, 342, 40, bg_hex="#141D2E", stroke_hex="#222E46", stroke_w=1, radius=8)
    eng.create_rect("M Active Pill", m_track, 3, 3, 166, 34, bg_hex="#263554", radius=6)
    eng.create_text("M Tab 1", m_track, 60, 11, 70, 16, "Password", size=12, weight="SemiBold", color_hex="#FFFFFF")
    eng.create_text("M Tab 2", m_track, 226, 11, 70, 16, "API Token", size=12, weight="Medium", color_hex="#94A3B8")

    # Mobile Input
    eng.create_text("M Input Label", s3, 24, 290, 200, 16, "PASSWORD WORKSPACE", size=11, weight="Bold", color_hex="#CBD5E1")
    m_inp = eng.create_frame("Mobile Input Box", s3, 24, 312, 342, 48, bg_hex="#131B2D", stroke_hex="#2B3C5E", stroke_w=1, radius=10)
    eng.create_text("M Inp Bullets", m_inp, 16, 16, 240, 20, "••••••••••••••••", size=15, weight="Bold", color_hex="#F8FAFC")
    eng.create_text("M Inp Hide", m_inp, 296, 16, 36, 18, "Hide", size=11, weight="SemiBold", color_hex="#64748B")

    # Mobile Aux
    eng.create_text("M Forgot Text", s3, 260, 372, 106, 16, "Lupa password?", size=12, weight="SemiBold", color_hex="#818CF8")

    # Mobile Primary CTA
    m_cta = eng.create_frame("Mobile CTA Button", s3, 24, 406, 342, 50, bg_hex="#4F46E5", stroke_hex="#6366F1", stroke_w=1, radius=12)
    eng.create_text("M CTA Label", m_cta, 110, 16, 160, 20, "Masuk Sekarang →", size=14, weight="Bold", color_hex="#FFFFFF")

    # Mobile Biometric Button
    m_bio = eng.create_frame("Mobile Biometric Button", s3, 24, 468, 342, 46, bg_hex="#131B2D", stroke_hex="#222F48", stroke_w=1, radius=10)
    eng.create_text("Bio Text", m_bio, 90, 14, 200, 18, "[FaceID] Masuk dengan Biometrik", size=12, weight="SemiBold", color_hex="#CBD5E1")

    # iOS Home Bar
    eng.create_rect("Home Bar", s3, 125, 828, 140, 5, bg_hex="#FFFFFF", radius=3)


    # =========================================================================
    # ARTBOARD 4: Design Tokens & Component Anatomy (960 x 640)
    # =========================================================================
    s4 = eng.create_frame("04 · Tokens & Component Specs", eng.page_id, 3570, 80, 960, 844, bg_hex="#0A0E18", stroke_hex="#1E293B", stroke_w=1, radius=20)

    eng.create_text("Token Title", s4, 40, 40, 400, 28, "Playdesign UI Design Tokens", size=22, weight="Bold", color_hex="#F8FAFC")
    eng.create_text("Token Sub", s4, 40, 72, 500, 20, "Fondasi palet warna netral, tipografi Plus Jakarta Sans, dan sistem komponen.", size=13, weight="Regular", color_hex="#94A3B8")

    # Swatch Grid
    swatches = [
        ("Brand Primary", "#4F46E5", "Primary CTA & Interactive Focus"),
        ("Brand Indigo", "#818CF8", "Accent links & Active highlights"),
        ("Surface Card", "#111726", "Elevated card backdrop"),
        ("Canvas Space", "#070A11", "Deep dark background"),
        ("Success Green", "#10B981", "Verified leads & System healthy"),
        ("Warning Gold", "#F59E0B", "Attention alert banners"),
        ("Border Subtle", "#223048", "Clean architectural dividers"),
        ("Text Primary", "#F8FAFC", "High-contrast headings"),
    ]

    for i, (name, col, desc) in enumerate(swatches):
        col_x = 40 + (i % 2) * 440
        row_y = 120 + (i // 2) * 80
        box = eng.create_frame(f"Swatch {name}", s4, col_x, row_y, 420, 68, bg_hex="#111726", stroke_hex="#1E293B", stroke_w=1, radius=10)
        eng.create_rect("Color Chip", box, 12, 12, 44, 44, bg_hex=col, stroke_hex="#334155", stroke_w=1, radius=8)
        eng.create_text("Swatch Name", box, 68, 14, 180, 18, name, size=13, weight="SemiBold", color_hex="#F8FAFC")
        eng.create_text("Swatch Hex", box, 68, 36, 100, 16, col, size=11, weight="Bold", color_hex="#818CF8")
        eng.create_text("Swatch Desc", box, 160, 36, 240, 16, desc, size=11, weight="Regular", color_hex="#94A3B8")

    # Typography Preview Block at Bottom of Artboard 4
    typo_box = eng.create_frame("Typography Hierarchy", s4, 40, 480, 880, 310, bg_hex="#111726", stroke_hex="#1E293B", stroke_w=1, radius=12)
    eng.create_text("Typo Title", typo_box, 24, 20, 300, 20, "Hierarki Tipografi (Plus Jakarta Sans)", size=14, weight="Bold", color_hex="#F8FAFC")

    eng.create_text("H1 Sample", typo_box, 24, 56, 800, 36, "Display Large 30px Bold — Satu Platform Operasional", size=24, weight="Bold", color_hex="#FFFFFF")
    eng.create_text("H2 Sample", typo_box, 24, 100, 800, 28, "Heading Medium 20px SemiBold — Masuk ke Workspace Tim", size=18, weight="SemiBold", color_hex="#F8FAFC")
    eng.create_text("Body Sample", typo_box, 24, 138, 800, 24, "Body Regular 14px — Kelola pipeline prospek, review konten, dan otomatisasi video.", size=13, weight="Regular", color_hex="#CBD5E1")
    eng.create_text("Caption Sample", typo_box, 24, 172, 800, 20, "Caption 11px Medium — CLOUDFLARE WORKERS & D1 DATABASE TERHUBUNG", size=11, weight="Medium", color_hex="#818CF8", letter_spacing=0.5)

    return eng


if __name__ == "__main__":
    out_file = "/Users/user/Documents/Jawad/DASHBOARD CRM/playdesign-login.figcraft"
    eng = generate_all_artboards()
    eng.save(out_file)

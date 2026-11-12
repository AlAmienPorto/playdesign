#!/usr/bin/env python3
"""
FigCraft Login UI Generator for Playdesign Office CRM.
Constructs an Anti-Slop, production-grade UI design in .figcraft format
with Desktop Password View, Desktop Token View, and Mobile iPhone View.
"""

import json
import os
import sys
import zipfile

# Color utility
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
    return [{
        "type": "solid",
        "color": hex_c(hex_code, a),
        "opacity": float(a),
        "visible": True,
        "blend": "normal"
    }]

def stroke_style(hex_code, weight=1.0, align="inside", a=1.0):
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

class DocBuilder:
    def __init__(self, name="Playdesign CRM — Login & Auth Experience"):
        self.name = name
        self.next_id = 1
        self.nodes = {}
        self.page_id = self.alloc_id()
        self.page_children = []

        self.nodes[str(self.page_id)] = {
            "id": self.page_id,
            "name": "Auth Screens",
            "type": "page",
            "background": hex_c("#090D16"),
            "flows": [],
            "prototype": {
                "device": "None",
                "background": hex_c("#090D16"),
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

    def create_frame(self, name, parent_id, x, y, width, height, bg_hex=None, radius=0, clip=True, layout=None):
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
        if layout:
            node["layout"] = layout
        self.add_node(node)

        # register to parent
        if parent_id in self.nodes:
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

    def create_text(self, name, parent_id, x, y, width, height, text, size=14, weight="Regular", color_hex="#FFFFFF", align="left", letter_spacing=0.0):
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

    def save_zip(self, out_path):
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
        os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
        with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("document.json", json.dumps(doc, indent=2))
        print(f"[OK] Generated {out_path} ({os.path.getsize(out_path)} bytes)")

print("DocBuilder loaded.")

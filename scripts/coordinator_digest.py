#!/usr/bin/env python3
"""Pintu masuk cron untuk digest koordinator.

Cron Hermes menjalankan skrip tanpa argumen, jadi perintah `report` dibungkus
di sini supaya `coordinator.py` tetap punya antarmuka CLI yang jelas.
"""

import sys

import coordinator

sys.exit(coordinator.main(["report"]))

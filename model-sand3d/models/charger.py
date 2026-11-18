"""Inductive AMR charging dock -> charger.glb"""

import sand3d as s3d
from lib.common import mat, CYAN, GREEN, VIOLET


def build(w=800, d=680, h=960):
    """Floor induction pad, docking bumper, vertical power column, and status LED bar."""
    pad = mat(s3d.at(s3d.box("chg_pad", w, d, 24), z=0), "steel", "#1d1a2e")
    coil = mat(s3d.at(s3d.cylinder("chg_coil", 360, 8), x=80, z=24), "painted_metal", VIOLET)
    column = mat(s3d.at(s3d.box("chg_column", 220, 380, h), x=-w / 2 + 120, z=24), "painted_metal", "#2a2740")
    s3d.fillet(column, 18, edges="side")
    panel = mat(s3d.at(s3d.box("chg_panel", 16, 260, 320), x=-w / 2 + 232, z=540), "brushed_steel", "#9a96b8")
    led_bar = mat(s3d.at(s3d.box("chg_status_led", 20, 220, 42), x=-w / 2 + 234, z=910), "light", GREEN, emission=2.8)
    guide_l = mat(s3d.at(s3d.box("chg_guide_l", 340, 24, 14), x=100, y=-260, z=24), "light", CYAN, emission=1.5)
    guide_r = mat(s3d.at(s3d.box("chg_guide_r", 340, 24, 14), x=100, y=260, z=24), "light", CYAN, emission=1.5)
    return s3d.assembly("charger", pad, coil, column, panel, led_bar, guide_l, guide_r)

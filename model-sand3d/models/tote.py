"""Storage tote -> tote.glb"""
import sand3d as s3d
from lib.common import mat, VIOLET, CYAN, PINK, AMBER, RED, GREEN


def build(w=600, d=400, h=300):
    tote = s3d.shell(s3d.box("tote", w, d, h), 12, open="top")
    s3d.fillet(tote, 10, edges="side")
    mat(tote, "plastic", CYAN)
    return s3d.assembly("tote_root", tote)

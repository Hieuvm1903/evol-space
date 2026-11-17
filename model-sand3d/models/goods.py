"""Cardboard carton (goods) with tape and shipping label -> goods.glb"""
import sand3d as s3d
from lib.common import mat, VIOLET, CYAN, PINK, AMBER, RED, GREEN


def build(w=400, d=300, h=250):
    box = mat(s3d.box("carton", w, d, h), "painted_metal", "#b8895a")
    s3d.fillet(box, 4, edges="side")
    tape = mat(s3d.at(s3d.box("tape", 60, d + 2, 3), z=h), "plastic", "#d9c7a3")
    tape_front = mat(s3d.at(s3d.box("tape_front", 60, 3, h * 0.35), y=d / 2, z=h * 0.65), "plastic", "#d9c7a3")
    label = mat(s3d.at(s3d.box("label", w * 0.35, 2, h * 0.3), x=-w * 0.2, y=d / 2 + 1, z=h * 0.25), "plastic", "#f5f3ff")
    barcode = mat(s3d.at(s3d.box("barcode", w * 0.25, 2, h * 0.1), x=-w * 0.2, y=d / 2 + 2, z=h * 0.3), "plastic", "#0a0912")
    return s3d.assembly("goods", box, tape, tape_front, label, barcode)

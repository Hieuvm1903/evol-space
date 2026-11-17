"""Filled sack / parcel bag with seam and tie -> bag.glb"""
import sand3d as s3d
from lib.common import mat, VIOLET, CYAN, PINK, AMBER, RED, GREEN


def build(w=450, d=280, h=600, color=VIOLET):
    body = s3d.box("bag_body", w, d, h)
    s3d.fillet(body, 60, edges="side")
    mat(body, "plastic", color)
    seam = mat(s3d.at(s3d.box("bag_seam", w * 0.9, 20, 30), z=h - 20), "plastic", "#2a2740")
    neck = mat(s3d.at(s3d.box("bag_neck", w * 0.5, d * 0.4, 70), z=h - 10), "plastic", color)
    tie = mat(s3d.at(s3d.box("bag_tie", w * 0.5 + 6, d * 0.4 + 6, 14), z=h + 20), "plastic", AMBER)
    tag = mat(s3d.at(s3d.box("bag_tag", w * 0.4, 2, h * 0.25), y=d / 2 + 1, z=h * 0.4), "plastic", "#f5f3ff")
    return s3d.assembly("bag", body, seam, neck, tie, tag)

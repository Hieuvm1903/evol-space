"""Conveyor section -> conveyor.glb"""
import sand3d as s3d
from lib.common import mat, VIOLET, CYAN, PINK, AMBER, RED, GREEN


def build(length=2000, width=640, height=750):
    legs = [mat(s3d.at(s3d.box(f"c_leg{i}", 50, 50, height - 30), x=sx * (length / 2 - 60), y=sy * (width / 2 - 20)),
                "steel", "#2a2740") for i, (sx, sy) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)])]
    rails = [mat(s3d.at(s3d.box(f"c_rail{i}", length, 40, 110), y=sy * (width / 2), z=height - 130), "painted_metal", AMBER)
             for i, sy in enumerate((-1, 1))]
    belt = mat(s3d.at(s3d.box("belt", length - 80, width - 70, 18), z=height - 60), "rubber", "#1d1a2e")
    rollers = [mat(s3d.at(s3d.cylinder(f"c_end{i}", 90, width - 70), x=sx * (length / 2 - 40), z=height - 60, rx=90, y=(width - 70) / 2),
                   "steel", "#8a86a8") for i, sx in enumerate((-1, 1))]
    glow = mat(s3d.at(s3d.box("c_glow", length - 200, 6, 8), y=-width / 2 - 4, z=height - 70), "light", CYAN, emission=3.0)
    return s3d.assembly("conveyor", *legs, *rails, belt, *rollers, glow)

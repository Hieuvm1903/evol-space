"""Straight rail track segment (chain several as instances) -> track.glb"""
import sand3d as s3d
from lib.common import mat, VIOLET, CYAN, PINK, AMBER, RED, GREEN


def build(length=4000, gauge=760, sleepers=9):
    """Two steel rails on sleepers with fish-plate joints and a glowing guide strip.
    Segment is `length` long along X, centred on the origin, so segments butt together.
    Rail centre-lines are at y = +/- gauge/2."""
    parts = []
    for i, sy in enumerate((-1, 1)):
        parts.append(mat(s3d.at(s3d.box(f"rail{i}", length, 60, 50), y=sy * gauge / 2, z=40), "steel", "#8a86a8"))
        parts.append(mat(s3d.at(s3d.box(f"rail_web{i}", length, 24, 30), y=sy * gauge / 2, z=20), "steel", "#2a2740"))
        parts.append(mat(s3d.at(s3d.box(f"fish_plate{i}", 160, 70, 60), x=length / 2 - 80, y=sy * gauge / 2, z=35), "brushed_steel", "#9a96b8"))
    step = (length - 300) / (sleepers - 1)
    for k in range(sleepers):
        parts.append(mat(s3d.at(s3d.box(f"sleeper{k}", 90, gauge + 220, 30), x=-length / 2 + 150 + k * step), "walnut", "#4a3a6a"))
    parts.append(mat(s3d.at(s3d.box("guide_strip", length - 200, 12, 6), z=50), "light", CYAN, emission=2.0))
    return s3d.assembly("track", *parts)

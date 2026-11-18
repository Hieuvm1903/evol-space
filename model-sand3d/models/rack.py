"""Storage rack bay -> rack.glb"""
import sand3d as s3d
from lib.common import mat, VIOLET, CYAN, PINK, AMBER, RED, GREEN


def build(w=1200, d=900, h=3000, levels=(200, 800, 1400, 2000, 2600)):
    """One storage bay: 4 uprights, front+back beams per level, decking."""
    parts = []
    for i, (sx, sy) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)]):
        up = mat(s3d.at(s3d.box(f"upright{i}", 60, 60, h), x=sx * (w / 2 - 30), y=sy * (d / 2 - 30)),
                 "painted_metal", "#4c3fa8")
        parts.append(up)
    for k, z in enumerate(levels):
        for j, sy in enumerate((-1, 1)):
            beam = mat(s3d.at(s3d.box(f"beam{k}_{j}", w - 60, 40, 90), y=sy * (d / 2 - 30), z=z), "painted_metal", AMBER)
            parts.append(beam)
        deck = mat(s3d.at(s3d.box(f"deck{k}", w - 80, d - 100, 12), z=z + 90), "steel", "#2a2740")
        parts.append(deck)
    return s3d.assembly("rack", *parts)

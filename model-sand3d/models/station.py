"""Pick station + status tower -> station.glb"""
import sand3d as s3d
from lib.common import mat, VIOLET, CYAN, PINK, AMBER, RED, GREEN


def build():
    """Pick station with a 3-lamp status tower — each lamp is its own mesh so
    telemetry can switch its emissive intensity independently."""
    legs = [mat(s3d.at(s3d.box(f"s_leg{i}", 60, 60, 880), x=sx * 440, y=sy * 280), "steel", "#2a2740")
            for i, (sx, sy) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)])]
    top = mat(s3d.at(s3d.box("s_top", 1000, 700, 40), z=880), "walnut", "#4a3a6a")
    screen = mat(s3d.at(s3d.box("s_screen", 420, 20, 260), y=200, z=940, rx=-10), "light", VIOLET, emission=2.0)
    pole = mat(s3d.at(s3d.cylinder("tower_pole", 30, 340), x=-430, y=-260, z=920), "steel", "#8a86a8")
    lamps = [mat(s3d.at(s3d.cylinder(name, 80, 70), x=-430, y=-260, z=1260 + i * 72), "light", col, emission=0.3)
             for i, (name, col) in enumerate([("tower_green", GREEN), ("tower_amber", AMBER), ("tower_red", RED)])]
    return s3d.assembly("station", *legs, top, screen, pole, *lamps)

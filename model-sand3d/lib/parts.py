"""Reusable part builders shared by several models."""
import sand3d as s3d
from lib.common import mat


def wheel(name, dia, width, x, y, z=None, color="#0a0912"):
    """Wheel with its axle along Y. (x, y, z) is the wheel centre; z defaults to resting on the floor.
    Same convention as robot.py: rx=+90 for the +Y side, rx=-90 for the -Y side."""
    side = 1 if y >= 0 else -1
    zc = dia / 2 if z is None else z
    return mat(s3d.at(s3d.cylinder(name, dia, width), x=x, y=y + side * width / 2, z=zc, rx=90 * side),
               "rubber", color)

"""AMR with wheel/lift joints -> robot.glb"""
import sand3d as s3d
from lib.common import mat, VIOLET, CYAN, PINK, AMBER, RED, GREEN


def build():
    """Autonomous mobile robot: two drive wheels, casters, lifting deck, lidar."""
    chassis = mat(s3d.box("chassis", 700, 500, 100), "painted_metal", "#e8e6f5")
    s3d.fillet(chassis, 18, edges="side")
    skirt = mat(s3d.at(s3d.box("skirt", 740, 540, 14), z=0), "rubber", "#0a0912")
    deck = mat(s3d.at(s3d.box("deck", 640, 440, 40), z=100), "painted_metal", VIOLET)
    # wheels: cylinders along Y; the joint pivot is the middle of the chassis side, wheel centre height 50
    wheel_l = mat(s3d.at(s3d.cylinder("wheel_l", 100, 40), x=0, y=-290, z=50, rx=-90), "rubber", "#0a0912")
    wheel_r = mat(s3d.at(s3d.cylinder("wheel_r", 100, 40), x=0, y=290, z=50, rx=90), "rubber", "#0a0912")
    casters = [mat(s3d.at(s3d.sphere(f"caster{i}", 40), x=sx * 290, y=0), "steel", "#8a86a8")
               for i, sx in enumerate((-1, 1))]
    lidar = mat(s3d.at(s3d.cylinder("lidar", 70, 40), x=280, y=0, z=140), "glossy_plastic", "#0a0912")
    lidar_glow = mat(s3d.at(s3d.torus("lidar_ring", 70, 8), x=280, y=0, z=170), "light", CYAN, emission=4.0)
    # lifting platform on a prismatic joint
    platform = mat(s3d.at(s3d.box("platform_plate", 520, 380, 16), z=140), "brushed_steel", "#9a96b8")
    marker = mat(s3d.at(s3d.box("platform_marker", 80, 80, 4), z=156), "light", PINK, emission=2.5)
    lift = s3d.group("lift", platform, marker)
    eyes = mat(s3d.at(s3d.box("status_strip", 8, 300, 12), x=352, z=60), "light", GREEN, emission=3.0)
    s3d.joint("wheel_l_spin", wheel_l, s3d.bbox(chassis, "-Y"), kind="continuous", axis="+Y")
    s3d.joint("wheel_r_spin", wheel_r, s3d.bbox(chassis, "+Y"), kind="continuous", axis="+Y")
    s3d.joint("lift_slide", lift, s3d.bbox(deck, "+Z"), kind="prismatic", axis="+Z", range=(0, 300))
    return s3d.assembly("robot", chassis, skirt, deck, wheel_l, wheel_r, *casters, lidar, lidar_glow, lift, eyes)

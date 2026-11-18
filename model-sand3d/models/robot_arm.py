"""6-axis-style industrial robot arm with parallel gripper -> robot_arm.glb"""
import sand3d as s3d
from lib.common import mat, VIOLET, CYAN, PINK, AMBER, RED, GREEN


def build(l1=550, l2=480):
    """Pedestal + turret (yaw) + upper arm (shoulder) + forearm (elbow) + wrist + gripper (2 fingers).
    Joints: base_yaw, shoulder_pitch, elbow_pitch, wrist_roll, finger_l_slide, finger_r_slide."""
    base = mat(s3d.cylinder("arm_base", 420, 120), "steel", "#2a2740")
    pedestal = mat(s3d.at(s3d.cylinder("arm_pedestal", 300, 160), z=120), "painted_metal", "#e8e6f5")

    # --- turret (rotates about Z) ---
    turret_body = mat(s3d.at(s3d.cylinder("turret_body", 280, 140), z=280), "painted_metal", VIOLET)
    shoulder_blk = mat(s3d.at(s3d.box("shoulder_block", 200, 260, 220), z=420), "painted_metal", VIOLET)
    turret = s3d.group("turret", turret_body, shoulder_blk)

    # --- upper arm (pitch about Y at z=520) ---
    upper = mat(s3d.at(s3d.box("upper_arm", 130, 180, l1), z=520), "painted_metal", "#e8e6f5")
    elbow_cap = mat(s3d.at(s3d.cylinder("elbow_cap", 190, 170, ), x=0, y=95, z=520 + l1, rx=90), "glossy_plastic", "#0a0912")
    upper_grp = s3d.group("upper_group", upper, elbow_cap)

    # --- forearm (pitch about Y at z=520+l1) ---
    z_e = 520 + l1
    fore = mat(s3d.at(s3d.box("forearm", 110, 140, l2), z=z_e), "painted_metal", "#e8e6f5")
    wrist_blk = mat(s3d.at(s3d.cylinder("wrist_block", 110, 90), z=z_e + l2), "steel", "#8a86a8")
    fore_grp = s3d.group("fore_group", fore, wrist_blk)

    # --- wrist + gripper (roll about Z at z_w) ---
    z_w = z_e + l2 + 90
    palm = mat(s3d.at(s3d.box("gripper_palm", 120, 160, 50), z=z_w), "brushed_steel", "#9a96b8")
    f_l = mat(s3d.at(s3d.box("finger_l", 30, 24, 110), y=-50, z=z_w + 50), "steel", "#2a2740")
    f_r = mat(s3d.at(s3d.box("finger_r", 30, 24, 110), y=50, z=z_w + 50), "steel", "#2a2740")
    tcp = mat(s3d.at(s3d.box("tcp_marker", 20, 20, 6), z=z_w + 160), "light", PINK, emission=3.0)
    gripper = s3d.group("gripper", palm, f_l, f_r, tcp)

    s3d.joint("base_yaw", turret, s3d.bbox(pedestal, "+Z"), kind="continuous", axis="+Z")
    s3d.joint("shoulder_pitch", upper_grp, s3d.bbox(shoulder_blk, "+Z"), kind="revolute", axis="+Y", range=(-90, 90))
    s3d.joint("elbow_pitch", fore_grp, s3d.bbox(upper, "+Z"), kind="revolute", axis="+Y", range=(-120, 120))
    s3d.joint("wrist_roll", gripper, s3d.bbox(wrist_blk, "+Z"), kind="continuous", axis="+Z")
    s3d.joint("finger_l_slide", f_l, s3d.bbox(palm, "+Z"), kind="prismatic", axis="+Y", range=(0, 40))
    s3d.joint("finger_r_slide", f_r, s3d.bbox(palm, "+Z"), kind="prismatic", axis="-Y", range=(0, 40))
    return s3d.assembly("robot_arm", base, pedestal, turret, upper_grp, fore_grp, gripper)

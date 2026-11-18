"""Articulated warehouse operator -> humanoid.glb"""

import sand3d as s3d
from lib.common import mat, AMBER, CYAN


def build():
    """Warehouse technician with high-vis vest, helmet, and articulated head, elbows, and knees.
    Joints: head_yaw, elbow_l_pitch, elbow_r_pitch, knee_l_pitch, knee_r_pitch."""
    # Torso & safety vest
    pelvis = mat(s3d.at(s3d.box("pelvis", 220, 300, 140), z=880), "plastic", "#1e293b")
    torso = mat(s3d.at(s3d.box("torso", 240, 340, 420), z=1020), "painted_metal", AMBER)
    vest_stripe = mat(s3d.at(s3d.box("vest_stripe", 246, 346, 55), z=1180), "light", CYAN, emission=1.2)

    # Head + helmet (pivots about Z on top of torso)
    neck = mat(s3d.at(s3d.cylinder("neck", 90, 60), z=1440), "plastic", "#d6b49c")
    cranium = mat(s3d.at(s3d.sphere("cranium", 180), z=1570), "plastic", "#d6b49c")
    helmet = mat(s3d.at(s3d.box("helmet", 230, 220, 90), z=1620), "glossy_plastic", "#f8fafc")
    s3d.fillet(helmet, 24, edges="side")
    headlamp = mat(s3d.at(s3d.box("headlamp", 24, 60, 30), x=112, z=1645), "light", CYAN, emission=2.5)
    head_grp = s3d.group("head_group", cranium, helmet, headlamp)

    # Upper arms (fixed shoulder sockets) + articulated forearms
    upper_l = mat(s3d.at(s3d.box("upper_arm_l", 90, 80, 260), y=-220, z=1150), "plastic", "#334155")
    upper_r = mat(s3d.at(s3d.box("upper_arm_r", 90, 80, 260), y=220, z=1150), "plastic", "#334155")
    fore_l = mat(s3d.at(s3d.box("forearm_l", 76, 70, 250), y=-220, z=900), "plastic", "#d6b49c")
    fore_r = mat(s3d.at(s3d.box("forearm_r", 76, 70, 250), y=220, z=900), "plastic", "#d6b49c")

    # Thighs + articulated shins/boots
    thigh_l = mat(s3d.at(s3d.box("thigh_l", 120, 110, 420), y=-95, z=460), "plastic", "#1e293b")
    thigh_r = mat(s3d.at(s3d.box("thigh_r", 120, 110, 420), y=95, z=460), "plastic", "#1e293b")

    shin_l = mat(s3d.at(s3d.box("shin_l", 100, 95, 380), y=-95, z=80), "plastic", "#1e293b")
    boot_l = mat(s3d.at(s3d.box("boot_l", 220, 105, 80), x=40, y=-95, z=0), "rubber", "#0a0912")
    leg_l = s3d.group("lower_leg_l", shin_l, boot_l)

    shin_r = mat(s3d.at(s3d.box("shin_r", 100, 95, 380), y=95, z=80), "plastic", "#1e293b")
    boot_r = mat(s3d.at(s3d.box("boot_r", 220, 105, 80), x=40, y=95, z=0), "rubber", "#0a0912")
    leg_r = s3d.group("lower_leg_r", shin_r, boot_r)

    s3d.joint("head_yaw", head_grp, s3d.bbox(neck, "+Z"), kind="revolute", axis="+Z", range=(-70, 70))
    s3d.joint("elbow_l_pitch", fore_l, s3d.bbox(upper_l, "-Z"), kind="revolute", axis="+Y", range=(-110, 30))
    s3d.joint("elbow_r_pitch", fore_r, s3d.bbox(upper_r, "-Z"), kind="revolute", axis="+Y", range=(-110, 30))
    s3d.joint("knee_l_pitch", leg_l, s3d.bbox(thigh_l, "-Z"), kind="revolute", axis="+Y", range=(-15, 95))
    s3d.joint("knee_r_pitch", leg_r, s3d.bbox(thigh_r, "-Z"), kind="revolute", axis="+Y", range=(-15, 95))

    return s3d.assembly(
        "humanoid",
        pelvis,
        torso,
        vest_stripe,
        neck,
        head_grp,
        upper_l,
        upper_r,
        fore_l,
        fore_r,
        thigh_l,
        thigh_r,
        leg_l,
        leg_r,
    )

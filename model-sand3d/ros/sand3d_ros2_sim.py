#!/usr/bin/env python3
"""Optional standalone ROS 2 (rclpy) warehouse simulator for sand3d.

Use this when you have a real ROS 2 + rosbridge_server environment locally:
  1. ros2 launch rosbridge_server rosbridge_websocket_launch.xml
  2. python3 model-sand3d/ros/sand3d_ros2_sim.py
  3. In the Work -> ROS 2 tab, switch to External and connect to ws://localhost:9090

If you do not have ROS 2 installed yet, use "Built-in Virtual ROS" directly in the Work page.
"""

import math
import time

import rclpy
from geometry_msgs.msg import PoseStamped, TransformStamped, Twist
from nav_msgs.msg import Odometry
from rclpy.node import Node
from sensor_msgs.msg import BatteryState, JointState, LaserScan
from tf2_msgs.msg import TFMessage


def wrap(angle: float) -> float:
    return (angle + math.pi) % (2.0 * math.pi) - math.pi


class Sand3dWarehouseSim(Node):
    def __init__(self):
        super().__init__("sand3d_warehouse_sim")

        self.x = -5.75
        self.y = -1.25
        self.yaw = 0.0
        self.vx = 0.0
        self.wz = 0.0
        self.battery = 0.88
        self.teleop_until = 0.0
        self.goal = None
        self.waypoints = [(-5.75, -1.25), (5.75, -1.25), (5.75, 1.0), (-5.75, 1.0)]
        self.wp_idx = 1
        self.phase = 0.0

        self.tf_pub = self.create_publisher(TFMessage, "/tf", 10)
        self.odom_pub = self.create_publisher(Odometry, "/amr_1/odom", 10)
        self.scan_pub = self.create_publisher(LaserScan, "/amr_1/scan", 10)
        self.bat_pub = self.create_publisher(BatteryState, "/amr_1/battery_state", 10)
        self.arm_pub = self.create_publisher(JointState, "/arm_1/joint_states", 10)

        self.create_subscription(Twist, "/amr_1/cmd_vel", self.on_cmd_vel, 10)
        self.create_subscription(PoseStamped, "/amr_1/goal_pose", self.on_goal_pose, 10)

        self.last_t = time.monotonic()
        self.create_timer(0.05, self.step)  # 20 Hz
        self.get_logger().info("sand3d ROS 2 virtual node started (/amr_1/odom, /amr_1/scan, /tf, /arm_1/joint_states)")

    def on_cmd_vel(self, msg: Twist):
        self.vx = max(-2.5, min(2.5, float(msg.linear.x)))
        self.wz = max(-3.0, min(3.0, float(msg.angular.z)))
        self.goal = None
        self.teleop_until = time.monotonic() + 2.0

    def on_goal_pose(self, msg: PoseStamped):
        self.goal = (float(msg.pose.position.x), float(msg.pose.position.y))
        self.teleop_until = 0.0
        self.get_logger().info(f"Received NavGoal: ({self.goal[0]:.2f}, {self.goal[1]:.2f})")

    def step(self):
        now = time.monotonic()
        dt = min(0.1, max(0.005, now - self.last_t))
        self.last_t = now
        self.phase += dt

        if now < self.teleop_until:
            self.yaw = wrap(self.yaw + self.wz * dt)
            self.x += math.cos(self.yaw) * self.vx * dt
            self.y += math.sin(self.yaw) * self.vx * dt
        else:
            target = self.goal if self.goal else self.waypoints[self.wp_idx]
            dx = target[0] - self.x
            dy = target[1] - self.y
            dist = math.hypot(dx, dy)
            if dist < 0.15:
                if self.goal:
                    self.goal = None
                    self.vx = 0.0
                    self.wz = 0.0
                else:
                    self.wp_idx = (self.wp_idx + 1) % len(self.waypoints)
            else:
                err = wrap(math.atan2(dy, dx) - self.yaw)
                self.wz = max(-2.4, min(2.4, err * 3.0))
                self.yaw = wrap(self.yaw + self.wz * dt)
                self.vx = 1.2 if abs(err) < 0.5 else 0.3
                self.x += math.cos(self.yaw) * self.vx * dt
                self.y += math.sin(self.yaw) * self.vx * dt

        stamp = self.get_clock().now().to_msg()
        qz = math.sin(self.yaw * 0.5)
        qw = math.cos(self.yaw * 0.5)

        tf_msg = TFMessage()
        t = TransformStamped()
        t.header.stamp = stamp
        t.header.frame_id = "map"
        t.child_frame_id = "AMR-1/base_link"
        t.transform.translation.x = self.x
        t.transform.translation.y = self.y
        t.transform.translation.z = 0.0
        t.transform.rotation.z = qz
        t.transform.rotation.w = qw
        tf_msg.transforms = [t]
        self.tf_pub.publish(tf_msg)

        odom = Odometry()
        odom.header.stamp = stamp
        odom.header.frame_id = "map"
        odom.child_frame_id = "AMR-1/base_link"
        odom.pose.pose.position.x = self.x
        odom.pose.pose.position.y = self.y
        odom.pose.pose.orientation.z = qz
        odom.pose.pose.orientation.w = qw
        odom.twist.twist.linear.x = self.vx
        odom.twist.twist.angular.z = self.wz
        self.odom_pub.publish(odom)

        scan = LaserScan()
        scan.header.stamp = stamp
        scan.header.frame_id = "AMR-1/laser_link"
        scan.angle_min = -math.pi
        scan.angle_max = math.pi
        scan.angle_increment = (2.0 * math.pi) / 72.0
        scan.range_min = 0.15
        scan.range_max = 12.0
        scan.ranges = [4.0 + 0.5 * math.sin(i * 0.25 + self.phase) for i in range(72)]
        self.scan_pub.publish(scan)

        arm = JointState()
        arm.header.stamp = stamp
        arm.name = ["base_yaw", "shoulder_pitch", "elbow_pitch", "wrist_roll", "finger_l_slide", "finger_r_slide"]
        arm.position = [
            math.sin(self.phase * 0.7) * 1.1,
            -0.35 + math.sin(self.phase * 1.4) * 0.25,
            -0.65 + math.cos(self.phase * 1.4) * 0.3,
            math.sin(self.phase * 2.0) * 0.7,
            0.02,
            0.02,
        ]
        self.arm_pub.publish(arm)

        bat = BatteryState()
        bat.header.stamp = stamp
        bat.percentage = self.battery
        bat.voltage = 26.8
        self.bat_pub.publish(bat)


def main():
    rclpy.init()
    node = Sand3dWarehouseSim()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()

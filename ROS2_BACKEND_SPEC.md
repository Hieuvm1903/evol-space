# EVOL Space (`/work`) — Standalone ROS 2 Backend Specification & Prompt

This document specifies the complete **ROS 2 + `rosbridge_suite` v2** backend contract expected by the EVOL Space 3D Warehouse Digital Twin (`/work` page). Use this file to migrate or re-implement the ROS 2 simulation/bridge backend in a separate repository (either as a **standalone Node.js/TypeScript `rosbridge` server**, a **native ROS 2 `rclpy` + `rosbridge_server` stack**, or both).

---

## 1. Architecture & Transport Overview

The frontend (`src/pages/work/rosBridge.ts`) connects over a standard WebSocket (`ws://` for local HTTP, **`wss://` required when the frontend is served over HTTPS**, e.g. via `ngrok`):

- **Protocol**: `rosbridge_suite` v2 JSON-over-WebSocket (`op`-framed JSON messages).
- **Default Paths / Ports**:
  - Built-in backend mode: `/ws/ros` on the backend HTTP server port (e.g. `ws://localhost:3000/ws/ros` or `wss://<host>/ws/ros`).
  - External ROS 2 / `rosbridge_server`: `ws://localhost:9090` or `wss://<ngrok-domain>` (via `ngrok http 9090`).
- **Control Loop Cadence**: `20 Hz` (`50 ms` tick) for physics, `/tf`, `/odom`, and `/joint_states`; `10 Hz` for 2D LiDAR `/scan`; `2 Hz` for `/battery_state` and `/fleet/diagnostics`.
- **Optional REST Status Endpoint**: `GET /api/ros/status` returning JSON server health and fleet summary.

---

## 2. Coordinate System Convention (CRITICAL)

All ROS 2 topics and services operate in **ROS `REP-103` ENU (`map` frame, right-handed, `+Z` up)**, while the frontend renders in **Three.js (`+Y` up)**.

The backend **must** always publish and consume **ROS coordinates**:

| Quantity | ROS (`map` frame) | Frontend Three.js Conversion |
| :--- | :--- | :--- |
| Position | `(x_ros, y_ros, z_ros)` | `x_three = x_ros`, `y_three = z_ros`, `z_three = -y_ros` |
| Orientation (`yaw`) | Counter-clockwise radians around `+Z` (`q = { x: 0, y: 0, z: sin(yaw/2), w: cos(yaw/2) }`) | `yaw_three = atan2(2*(w*z + x*y), 1 - 2*(y*y + z*z))` |
| Twist (`cmd_vel`) | `linear.x` = forward (+body X), `linear.y` = strafe left, `linear.z` = climb (drones), `angular.z` = +yaw rate | Applied directly in body frame |

---

## 3. Fleet Entities, Namespaces & Initial States

Scene objects are matched by **robot label (`id`)**. TF `child_frame_id` uses `<ID>/base_link`, and namespaced topics use lower-snake-case (`/<id_lowercase_underscored>`):

| Entity ID (`label`) | Type | ROS Namespace | Initial ROS Pose `(x, y, z, yaw)` | Autonomous Behavior / Kinematics |
| :--- | :--- | :--- | :--- | :--- |
| `AMR-1` | Ground AMR | `/amr_1` | `(-5.75, -1.25, 0, 0)` | Rectangular aisle patrol (`1.2 m/s`); has 2D LiDAR (`AMR-1/laser_link`) |
| `AMR-2` | Ground AMR | `/amr_2` | `(-5.75, -3.75, 0, 0)` | Rectangular aisle patrol (`1.2 m/s`) |
| `AMR-3` | Ground AMR | `/amr_3` | `(-5.75, -6.25, 0, 0)` | Rectangular aisle patrol (`1.2 m/s`) |
| `DR-1` | Aerial Drone | `/dr_1` | `(10.5, -9.5, 4.5, 0)` | 8-pt elliptical loop around `(0, -3.0)` radius `(9.0, 5.5)` at `z = 4.5m`, `2.3 m/s` |
| `DR-2` | Aerial Drone | `/dr_2` | `(-10.5, -9.5, 5.5, 0)` | 8-pt elliptical loop around `(0, -3.0)` radius `(6.0, 3.5)` at `z = 5.5m`, `1.9 m/s` |
| `TR-1` | Dock Truck | `/tr_1` | `(0.0, 8.8, 0, +π/2)` | Shuttles `[0, 8.8]` ↔ `[0, 22.0]` at `1.8 m/s` with `3.5s–4.0s` dock dwell |
| `ARM-1` | 6-DOF Arm | `/arm_1` | Fixed base | 6 joints: `["base_yaw", "shoulder_pitch", "elbow_pitch", "wrist_roll", "finger_l_slide", "finger_r_slide"]` |
| `XFER-1` | Transfer Gantry | `/xfer_1` | Fixed base | 3 prismatic joints: `["travel_slide", "lift_slide", "fork_slide"]` |

### AMR Patrol Waypoints (`[x_ros, y_ros]`)
For `k ∈ {0, 1, 2}` (`AMR-1` .. `AMR-3`):
- `x0 = -5.75`, `x1 = +5.75`
- `za = k * 2.5 + 1.25`, `zc = -1.0 - 0.4 * k`
- Patrol loop: `[ [x0, -za], [x1, -za], [x1, -zc], [x0, -zc] ]`

### Root Namespace Fallback Support
The frontend also subscribes to standard un-namespaced root topics for interoperability with generic local ROS 2 setups:
- `/odom` → maps to `AMR-1`
- `/scan` → maps to `AMR-1`
- `/joint_states` → maps to `ARM-1`
- `/cmd_vel`, `/goal_pose` (when client selects `Root`) → target `AMR-1`

---

## 4. Warehouse Geometry & 2D LiDAR Raycast Spec

If simulating `/amr_1/scan` without Gazebo, raycast against these 2D axis-aligned bounding boxes in ROS `(x, y)` coordinates (`y_ros = -z_three`):
- **Outer Warehouse Walls**: `minX = -11.9`, `maxX = 11.9`, `minY = -10.9`, `maxY = 4.9`
- **4×8 Storage Racks**:
  - For `r ∈ [0..3]`: `y_ros = -(r * 2.5)`
  - For `i ∈ [0..7]`: `x = (i - 3.5) * 1.3`
  - Box: `[x - 0.55, x + 0.55] × [y_ros - 0.42, y_ros + 0.42]`
- **Conveyor (`CV-1`)**: `minX = 6.9, maxX = 7.8, minY = -5.2, maxY = -2.3`
- **Station (`ST-1`)**: `minX = -8.1, maxX = -7.0, minY = 0.9, maxY = 1.9`
- **Charging Pad Zone**: `x < -8.0 && y_ros > -7.0 && y_ros < -3.0` (AMRs inside recharge at `+3.5%/s`; otherwise drain `(0.04 + 0.03 * speed)%/s`).

---

## 5. `rosbridge_suite` v2 Wire Protocol

### Client → Server Operations
1. **Subscribe**:
   ```json
   { "op": "subscribe", "topic": "/amr_1/odom", "type": "nav_msgs/msg/Odometry", "throttle_rate": 40 }
   ```
   - Backend must respect `throttle_rate` (minimum milliseconds between broadcasts per client+topic).
2. **Unsubscribe**:
   ```json
   { "op": "unsubscribe", "topic": "/amr_1/odom" }
   ```
3. **Advertise**:
   ```json
   { "op": "advertise", "topic": "/amr_1/cmd_vel", "type": "geometry_msgs/msg/Twist" }
   ```
4. **Publish**:
   ```json
   { "op": "publish", "topic": "/amr_1/cmd_vel", "msg": { ... } }
   ```
5. **Service Call**:
   ```json
   { "op": "call_service", "id": "call_1", "service": "/rosapi/topics", "args": {} }
   ```

### Server → Client Operations
1. **Topic Broadcast**:
   ```json
   { "op": "publish", "topic": "<topic_name>", "msg": { ... } }
   ```
2. **Service Response**:
   ```json
   { "op": "service_response", "id": "call_1", "service": "<service_name>", "result": true, "values": { ... } }
   ```
   On error: `"result": false, "values": { "message": "..." }`.

---

## 6. Complete Topic & Message Contracts

### Outbound Topics (Backend → Frontend)

| Topic | ROS 2 Type | Rate | Payload Schema |
| :--- | :--- | :--- | :--- |
| `/tf` | `tf2_msgs/msg/TFMessage` | 20 Hz | `{ "transforms": [{ "header": { "stamp": { "sec": 0, "nanosec": 0 }, "frame_id": "map" }, "child_frame_id": "AMR-1/base_link", "transform": { "translation": { "x": 0, "y": 0, "z": 0 }, "rotation": { "x": 0, "y": 0, "z": 0, "w": 1 } } }] }` |
| `/<ns>/odom` | `nav_msgs/msg/Odometry` | 20 Hz | `{ "header": { "stamp": ..., "frame_id": "map" }, "child_frame_id": "<ID>/base_link", "pose": { "pose": { "position": { "x": 0, "y": 0, "z": 0 }, "orientation": { "x": 0, "y": 0, "z": 0, "w": 1 } } }, "twist": { "twist": { "linear": { "x": 0, "y": 0, "z": 0 }, "angular": { "x": 0, "y": 0, "z": 0 } } } }` |
| `/amr_1/scan` | `sensor_msgs/msg/LaserScan` | 10 Hz | `{ "header": { "stamp": ..., "frame_id": "AMR-1/laser_link" }, "angle_min": -3.14159, "angle_max": 3.14159, "angle_increment": 0.087266, "range_min": 0.15, "range_max": 12.0, "ranges": [ ...72 floats... ] }` |
| `/amr_1..3/battery_state` | `sensor_msgs/msg/BatteryState` | 2 Hz | `{ "header": ..., "voltage": 27.8, "percentage": 0.88, "power_supply_status": 2 }` (`percentage` in `0.0..1.0` or `0..100`) |
| `/arm_1/joint_states`, `/xfer_1/joint_states` | `sensor_msgs/msg/JointState` | 20 Hz | `{ "header": { "stamp": ..., "frame_id": "<ID>" }, "name": [...], "position": [...], "velocity": [...], "effort": [...] }` |
| `/fleet/diagnostics` | `diagnostic_msgs/msg/DiagnosticArray` | 2 Hz | `{ "header": ..., "status": [{ "level": 0, "name": "AMR-1", "message": "Autonomous patrol", "hardware_id": "/amr_1", "values": [{ "key": "mode", "value": "patrol" }, { "key": "battery_pct", "value": "88.0" }, { "key": "temperature_c", "value": "36.5" }, { "key": "speed_mps", "value": "1.20" }] }] }` (`level`: `0=OK, 1=WARN, 2=ERROR`) |
| `/rosout` | `rcl_interfaces/msg/Log` | Event | `{ "stamp": { "sec": ..., "nanosec": ... }, "level": 20, "name": "/sim_fleet_controller", "msg": "..." }` (`20=INFO, 30=WARN, 40=ERROR`) |

### Inbound Topics (Frontend → Backend)

| Topic | ROS 2 Type | Behavior Expected on Backend |
| :--- | :--- | :--- |
| `/<ns>/cmd_vel` (or `/cmd_vel`) | `geometry_msgs/msg/Twist` | Switch target robot (if not in `fault` mode) to `teleop` mode with `~2.2s` watchdog timeout. Apply `linear.x` (fwd), `linear.y` (strafe), `linear.z` (drone climb), `angular.z` (yaw). Clamp bounds `x ∈ [-11.8, 11.8]`, `y ∈ [-10.8, 24.0]`, drone `z ∈ [0.2, 7.5]`. |
| `/<ns>/goal_pose` (or `/goal_pose`) | `geometry_msgs/msg/PoseStamped` | Switch target robot (if not in `fault`) to `goal` mode and navigate autonomously to `(pose.position.x, pose.position.y)` clamped to `x ∈ [-11.5, 11.5], y ∈ [-10.5, 4.5]`. |
| `/arm_1/joint_cmd`, `/xfer_1/joint_cmd` | `sensor_msgs/msg/JointState` | Disable `autoMode` on device and smoothly interpolate joints in `msg.name` toward `msg.position` at `1.6 rad/s` (or `m/s`). |

---

## 7. ROS Service Contracts (`/rosapi/*` and `/sim/*`)

| Service | Request `args` | Response `values` | Behavior |
| :--- | :--- | :--- | :--- |
| `/rosapi/topics` | `{}` | `{ "topics": string[], "types": string[] }` | Lists all active topics and types |
| `/rosapi/nodes` | `{}` | `{ "nodes": string[] }` | Lists active ROS node names |
| `/rosapi/services` | `{}` | `{ "services": string[] }` | Lists available service names |
| `/sim/set_pause` | `{ "data": boolean }` | `{ "success": true, "message": "Paused" \| "Running" }` | Pauses/resumes physics & publishers |
| `/sim/reset` | `{}` | `{ "success": true, "message": "..." }` | Unpauses and resets all robots & joints to initial poses |
| `/amr/resume_patrol` | `{ "robot"?: string }` | `{ "success": true, "message": "Patrol resumed" }` | Clears `goal`/`cmdVel` on non-faulted robot(s) and resumes `patrol` |
| `/arm_1/set_preset` | `{ "preset": "home" \| "pick" \| "place" \| "auto" }` | `{ "success": true, "preset": string }` | `auto`: sine demo; `home`: `[0,0,0,0,0.01,0.01]`; `pick`: `[0,-0.45,-0.85,0,0.035,0.035]`; `place`: `[1.57,-0.35,-0.45,0.3,0.035,0.035]` |
| `/sim/fault` | `{ "id": string, "fault": "overheat" \| "jam" \| "battery" \| "clear" }` | `{ "success": true, "id": string, "mode": string }` | Injects fault (stops robot, updates diagnostics level `2`) or clears back to `patrol` |

---

## 8. HTTP Status Endpoint (`GET /api/ros/status`)

Optional REST diagnostic endpoint returning:
```json
{
  "running": true,
  "paused": false,
  "clients": 1,
  "nodes": ["/rosbridge_websocket", "/rosapi", "/sim_fleet_controller", "/sim_arm_controller", "/sim_xfer_controller", "/sim_drone_bridge", "/sim_lidar_sensor"],
  "topicCount": 25,
  "wsPath": "/ws/ros",
  "robots": [
    { "id": "AMR-1", "ns": "/amr_1", "mode": "patrol", "battery": 88.0 }
  ]
}
```

---

## 9. Deployment, HTTPS & ngrok Compatibility

- **Bind Host**: Listen on `0.0.0.0` (e.g. port `9090` for `rosbridge_server` or port `3000`/`8080` for custom server).
- **HTTPS / `wss://`**: Because the EVOL Space frontend may run on `https://`, expose your local server over TLS using `ngrok http <port>` and connect in **ROS 2 & WebSocket → External ROS** using `wss://<your-id>.ngrok-free.app`.
- **ngrok Free Tier Note**: Visit `https://<your-id>.ngrok-free.app` once in the browser and click **Visit Site** to dismiss ngrok's interstitial warning before opening the WebSocket from the app.

---

## 10. Ready-to-Use Migration Prompt (Copy into Another Project)

> **Prompt:**
> Build a standalone ROS 2 simulation & `rosbridge_suite` v2 WebSocket backend that implements the full contract in `ROS2_BACKEND_SPEC.md` so an external Three.js Digital Twin frontend can connect over `ws://localhost:9090/ws/ros` (or `wss://` behind `ngrok`).
>
> Requirements:
> 1. Implement a `rosbridge_suite` v2 JSON WebSocket server on `/ws/ros` (supporting `subscribe` with `throttle_rate`, `unsubscribe`, `advertise`, `publish`, `call_service`, and `service_response`) plus `GET /api/ros/status` (and optionally a native `rclpy` ROS 2 node using `rosbridge_server`).
> 2. Simulate the full warehouse fleet at `20 Hz` in ROS `REP-103` `map` coordinates (`+X` forward, `+Y` left, `+Z` up): `AMR-1`, `AMR-2`, `AMR-3` (aisle patrol + battery/thermal physics + charging pad recharge), `DR-1`, `DR-2` (elliptical aerial patrols), `TR-1` (dock truck shuttle with dwell), `ARM-1` (6-DOF arm), and `XFER-1` (3-axis transfer gantry).
> 3. Raycast a 72-beam `10 Hz` 2D `sensor_msgs/msg/LaserScan` on `/amr_1/scan` (`range_min: 0.15`, `range_max: 12.0`) against the exact 4×8 rack bays, conveyor `CV-1`, station `ST-1`, and outer warehouse walls (`[-11.9, 11.9] × [-10.9, 4.9]`).
> 4. Publish `/tf`, `/<ns>/odom`, `/<ns>/joint_states`, `/<ns>/battery_state`, `/fleet/diagnostics`, and `/rosout`; handle inbound `/<ns>/cmd_vel` (with 2.2s teleop watchdog), `/<ns>/goal_pose`, `/<ns>/joint_cmd`, and root aliases (`/odom`, `/scan`, `/joint_states`, `/cmd_vel`, `/goal_pose` mapped to `AMR-1`/`ARM-1`).
> 5. Implement ROS services `/rosapi/topics`, `/rosapi/nodes`, `/rosapi/services`, `/sim/set_pause`, `/sim/reset`, `/amr/resume_patrol`, `/arm_1/set_preset`, and `/sim/fault`.
> 6. Include `.env.example`, startup scripts (`npm run dev` / `docker-compose` or Python launch instructions), and `ngrok http <port>` instructions for `wss://` browser connections.

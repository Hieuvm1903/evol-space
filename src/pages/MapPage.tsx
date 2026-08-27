import React, { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Circle, useMap, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Button, Tabs, Input, ColorPicker, Tag, Empty, Tooltip, InputNumber, Typography, Popover, Space,
  AutoComplete,
  Switch,
  Select,
} from "antd";
import {
  MapPin, Plus, Search, LocateFixed, Pencil, Trash2, Navigation2, X, SlidersHorizontal, Crosshair,
  Compass,
  LucideIcon,
  MapIcon,
  Maximize2,
  Moon,
  Mountain,
  PenLine,
  Ruler,
  Satellite,
  Sun,
  Minimize2,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import * as placesService from "../lib/placesService";
import { Place } from "../lib/placesService";
import { PLACE_ICON_CHOICES, iconForName, splitIcon, DEFAULT_ICON_NAME, DEFAULT_COLOR, labelForName } from "../content/placeIcons";
import "./MapPage.css";
import TargetCursor from "../components/TargetCursor";

const { Text, Title } = Typography;

// NOT PORTED (flagging honestly, same as before): multiple tile styles,
// draw/sketch tools, heatmap overlay, marker clustering, measure-distance,
// fullscreen/minimap plugins. Core CRUD, right-click-add, search/filter,
// and geolocation all work — now laid out as a fixed left rail + map.

const DEFAULT_CENTER: [number, number] = [16.0, 106.0];
const DEFAULT_ZOOM = 5;
type MapMode = "light" | "dark" | "street" | "satellite" | "terrain";
type MapTool = "fullscreen" | "measure" | "coordinates" | "draw";

const MAP_MODE_OPTIONS: { value: MapMode; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "street", label: "Street", icon: MapIcon },
  { value: "satellite", label: "Satellite", icon: Satellite },
  { value: "terrain", label: "Terrain", icon: Mountain },
];

const MAP_TILE_CONFIG: Record<MapMode, { url: string; attribution: string }> = {
  light: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
  },
  terrain: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
  },
};

const MAP_TOOL_OPTIONS: { value: MapTool; label: string; icon: LucideIcon }[] = [
  { value: "fullscreen", label: "Full screen", icon: Maximize2 },
  { value: "measure", label: "Measure distance", icon: Ruler },
  { value: "coordinates", label: "Cursor coordinates", icon: Compass },
  { value: "draw", label: "Draw / sketch", icon: PenLine },
];

const MAP_MODE_KEY = "evol_map_mode";
const MAP_TOOLS_KEY = "evol_map_tools";

function readMapMode(): MapMode {
  try {
    const raw = localStorage.getItem(MAP_MODE_KEY);
    return (raw as MapMode) || "dark";
  } catch {
    return "dark";
  }
}

function readMapTools(): MapTool[] {
  try {
    const raw = localStorage.getItem(MAP_TOOLS_KEY);
    return raw ? (JSON.parse(raw) as MapTool[]) : [];
  } catch {
    return [];
  }
}
// Glowing lucide-icon markers, cached per icon+color pair so we only pay
// the renderToStaticMarkup cost once per distinct combination, not once
// per place.
const markerIconCache = new Map<string, L.DivIcon>();
function glowDivIcon(iconName: string, colorHex: string, opacity = 1): L.DivIcon {
  const key = `${iconName}|${colorHex}|${opacity}`;
  const cached = markerIconCache.get(key);
  if (cached) return cached;
  const Icon = iconForName(iconName);
  const svg = renderToStaticMarkup(<Icon size={16} color="#fff" strokeWidth={2.4} />);
  const html = `
       <div class="galaxy-marker cursor-target" style="--marker-color:${colorHex};opacity:${opacity}">

      <div class="galaxy-marker-glow"></div>
      <div class="galaxy-marker-pin">${svg}</div>
    </div>`;
  const icon = L.divIcon({ html, className: "galaxy-marker-wrap", iconSize: [36, 36], iconAnchor: [18, 34] });
  markerIconCache.set(key, icon);
  return icon;
}

interface FormState {
  editId: number | null;
  name: string;
  lat: string;
  lon: string;
  description: string;
  iconName: string;
  color: string;
  tags: string;
}

function emptyForm(prefill?: { lat: number; lon: number }): FormState {
  return {
    editId: null,
    name: "",
    lat: prefill ? prefill.lat.toFixed(6) : "20.834955",
    lon: prefill ? prefill.lon.toFixed(6) : "106.718237",
    description: "",
    iconName: DEFAULT_ICON_NAME,
    color: DEFAULT_COLOR,
    tags: "",
  };
}

function formFromPlace(p: Place): FormState {
  const { name, color } = splitIcon(p.icon);
  return {
    editId: p.id, name: p.name, lat: String(p.lat), lon: String(p.lon),
    description: p.description, iconName: name, color, tags: p.tags,
  };
}
function tagSuggestions(value: string, allTags: string[]): string[] {
  const parts = value.split(",").map((t) => t.trim());
  const current = (parts[parts.length - 1] ?? "").toLowerCase();
  const already = new Set(parts.slice(0, -1).map((t) => t.toLowerCase()).filter(Boolean));
  return allTags
    .filter((t) => !already.has(t.toLowerCase()) && t.toLowerCase().includes(current))
    .slice(0, 8);
}

function applyTagSuggestion(value: string, picked: string): string {
  const parts = value.split(",").map((t) => t.trim());
  parts[parts.length - 1] = picked;
  return parts.filter(Boolean).join(", ") + ", ";
}
function MapEvents({ onRightClick, onLeftClick }: {
  onRightClick: (lat: number, lon: number) => void;
  onLeftClick: () => void;
}) {
  useMapEvents({
    contextmenu(e) { onRightClick(e.latlng.lat, e.latlng.lng); },
    click() { onLeftClick(); },
  });
  return null;
}
function MapDragLock({ locked }: { locked: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (locked) map.dragging.disable();
    else map.dragging.enable();
  }, [locked, map]);
  return null;
}

function CursorCoordinatesTool({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({
    mousemove(e) { onMove(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

function MeasureTool({ onAddPoint, onClear }: {
  onAddPoint: (lat: number, lng: number) => void;
  onClear: () => void;
}) {
  useMapEvents({
    click(e) { onAddPoint(e.latlng.lat, e.latlng.lng); },
    dblclick() { onClear(); },
  });
  return null;
}

function SketchTool({ onStart, onExtend, onEnd }: {
  onStart: (lat: number, lng: number) => void;
  onExtend: (lat: number, lng: number) => void;
  onEnd: () => void;
}) {
  const drawingRef = useRef(false);
  useMapEvents({
    mousedown(e) { drawingRef.current = true; onStart(e.latlng.lat, e.latlng.lng); },
    mousemove(e) { if (drawingRef.current) onExtend(e.latlng.lat, e.latlng.lng); },
    mouseup() { drawingRef.current = false; onEnd(); },
  });
  return null;
}
export function MapPage() {
  const { user } = useAuth();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"browse" | "form" | "config">("browse");
  const [mapMode, setMapMode] = useState<MapMode>(readMapMode);
  const [activeTools, setActiveTools] = useState<MapTool[]>(readMapTools);
  const [fullscreen, setFullscreen] = useState(false);
  const [cursorLatLng, setCursorLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);
  const [sketchLines, setSketchLines] = useState<[number, number][][]>([]);
  const [activeSketch, setActiveSketch] = useState<[number, number][] | null>(null); const [panelMode, setPanelMode] = useState<"none" | "add" | "edit">("none");
  const [form, setForm] = useState<FormState>(emptyForm());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [myLocation, setMyLocation] = useState<[number, number] | null>(null);

  const [nameFilter, setNameFilter] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [distCenter, setDistCenter] = useState("");
  const [radiusKm, setRadiusKm] = useState(0);
  const [iconFilter, setIconFilter] = useState<string[]>([]);
  const mapRef = useRef<L.Map | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    setPlaces(await placesService.getPlaces(user.id));
    setLoading(false);
  }
  useEffect(() => { load(); }, [user]);

  if (!user) {
    return (
      <div className="page">
        <h2><MapPin size={22} style={{ verticalAlign: -4, marginRight: 8 }} />Places</h2>
        <p>Log in first (see the Login tab) — your places are personal to your account.</p>
      </div>
    );
  }

  function openAdd(prefill?: { lat: number; lon: number }) {
    setForm(emptyForm(prefill));
    setPanelMode("add");
    setTab("form");
  }

  function openEdit(p: Place) {
    setForm(formFromPlace(p));
    setPanelMode("edit");
    setTab("form");
  }

  function closeForm() {
    setPanelMode("none");
    setTab("browse");
  }

  async function handleSave() {
    const lat = parseFloat(form.lat);
    const lon = parseFloat(form.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) { alert("Couldn't parse latitude/longitude — please check the values."); return; }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) { alert("Latitude must be -90..90 and longitude -180..180."); return; }
    const icon = `${form.iconName}|${form.color}`;
    const finalName = form.name.trim() || "Untitled place";

    if (form.editId !== null) {
      await placesService.updatePlace(form.editId, finalName, lat, lon, form.description.trim(), icon, form.tags);
    } else {
      await placesService.addPlace(user!.id, finalName, lat, lon, form.description.trim(), icon, form.tags);
    }
    closeForm();
    load();
  }

  async function handleDelete(placeId: number) {
    if (!confirm("Delete this place?")) return;
    await placesService.deletePlace(placeId, user!.id);
    if (selectedId === placeId) setSelectedId(null);
    load();
  }
  function updateMapMode(mode: MapMode) {
    setMapMode(mode);
    try { localStorage.setItem(MAP_MODE_KEY, mode); } catch { }
  }

  function updateActiveTools(tools: MapTool[]) {
    setActiveTools(tools);
    try { localStorage.setItem(MAP_TOOLS_KEY, JSON.stringify(tools)); } catch { }
    if (!tools.includes("fullscreen")) setFullscreen(false);
    else setFullscreen(true);
    if (!tools.includes("measure")) setMeasurePoints([]);
    if (!tools.includes("draw")) setActiveSketch(null);
  }

  function handleMeasureAddPoint(lat: number, lng: number) {
    setMeasurePoints((pts) => [...pts, [lat, lng]]);
  }

  function handleMeasureClear() {
    setMeasurePoints([]);
  }
  function addMeasurePointFromLocation() {
    if (!navigator.geolocation) { alert("Geolocation not available in this browser."); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => handleMeasureAddPoint(pos.coords.latitude, pos.coords.longitude),
      (err) => alert(`Couldn't get your location: ${err.message}`),
    );
  }
  function handleSketchStart(lat: number, lng: number) {
    setActiveSketch([[lat, lng]]);
  }

  function handleSketchExtend(lat: number, lng: number) {
    setActiveSketch((line) => (line ? [...line, [lat, lng]] : [[lat, lng]]));
  }

  function handleSketchEnd() {
    setActiveSketch((line) => {
      if (line && line.length > 1) setSketchLines((all) => [...all, line]);
      return null;
    });
  }
  function addSketchPointFromLocation() {
    if (!navigator.geolocation) { alert("Geolocation not available in this browser."); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => handleSketchExtend(pos.coords.latitude, pos.coords.longitude),
      (err) => alert(`Couldn't get your location: ${err.message}`),
    );
  }
  function clearSketches() {
    setSketchLines([]);
    setActiveSketch(null);
  }

  useEffect(() => {
    const id = setTimeout(() => mapRef.current?.invalidateSize(), 220);
    return () => clearTimeout(id);
  }, [fullscreen]);
  function useMyLocationForForm() {
    if (!navigator.geolocation) { alert("Geolocation not available in this browser."); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setForm((f) => ({ ...f, lat: pos.coords.latitude.toFixed(6), lon: pos.coords.longitude.toFixed(6) })),
      (err) => alert(`Couldn't get your location: ${err.message}`),
    );
  }
  function useMyLocationForDistanceFilter() {
    if (!navigator.geolocation) { alert("Geolocation not available in this browser."); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setDistCenter(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`),
      (err) => alert(`Couldn't get your location: ${err.message}`),
    );
  }
  function useMyLocationOnMap() {
    if (!navigator.geolocation) { alert("Geolocation not available in this browser."); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setMyLocation(c);
        mapRef.current?.flyTo(c, 13, { duration: 0.7 });
      },
      (err) => alert(`Couldn't get your location: ${err.message}`),
    );
  }

  function selectAndFly(p: Place) {
    setSelectedId(p.id);
    mapRef.current?.flyTo([p.lat, p.lon], 15, { duration: 0.6 });
  }

  const allTags = useMemo(() => placesService.getAllTags(places), [places]);
  const measuredDistanceKm = useMemo(() => {
    let total = 0;
    for (let i = 1; i < measurePoints.length; i++) {
      total += placesService.haversineKm(
        measurePoints[i - 1][0], measurePoints[i - 1][1],
        measurePoints[i][0], measurePoints[i][1],
      );
    }
    return total;
  }, [measurePoints]);
  const filtered = useMemo(() => {
    let result = places;
    if (nameFilter.trim()) result = result.filter((p) => p.name.toLowerCase().includes(nameFilter.trim().toLowerCase()));
    if (iconFilter.length) {
      result = result.filter((p) => iconFilter.includes(splitIcon(p.icon).name));
    }
    if (tagFilter.length) {
      result = result.filter((p) => {
        const placeTags = p.tags.split(",").map((t) => t.trim());
        return tagFilter.some((t) => placeTags.includes(t));
      });
    }
    let radiusCircle: { center: [number, number]; radiusKm: number } | null = null;
    if (distCenter.trim() && radiusKm > 0) {
      const parts = distCenter.split(",").map((s) => parseFloat(s.trim()));
      if (parts.length === 2 && !parts.some(Number.isNaN)) {
        const [clat, clon] = parts;
        radiusCircle = { center: [clat, clon], radiusKm };
        result = result.filter((p) => placesService.haversineKm(clat, clon, p.lat, p.lon) <= radiusKm);
      }
    }
    return { result, radiusCircle };
  }, [places, nameFilter, iconFilter, tagFilter, distCenter, radiusKm]);

  const previewLat = parseFloat(form.lat);
  const previewLon = parseFloat(form.lon);
  const hasPreview = tab === "form" && !Number.isNaN(previewLat) && !Number.isNaN(previewLon);
  useEffect(() => {
    if (!fullscreen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        updateActiveTools(activeTools.filter((t) => t !== "fullscreen"));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen, activeTools]);
  return (
    <div className="page map-page-shell">
      <TargetCursor targetSelector=".cursor-target" />
      <div className="map-page-heading">
        <Title level={3} style={{ margin: 0 }}>
          <MapPin size={22} style={{ verticalAlign: -4, marginRight: 8, color: "#8b6ff5" }} />
          Places
        </Title>
      </div>
      <p className="map-page-sub">Right-click the map to drop a pin, or use "Add place" on the left.</p>

      <div className="map-layout">
        {/* ---------------- Left rail ---------------- */}
        <div className="map-sidebar">
          <Tabs
            className="map-sidebar-tabs"
            activeKey={tab}
            onChange={(k) => {
              if (k === "browse") closeForm();
              else if (k === "form" && panelMode === "none") openAdd();
              setTab(k as any);
            }}
            items={[
              { key: "browse", label: "Browse" },
              { key: "form", label: panelMode === "edit" ? "Edit place" : "Add place" },
              { key: "config", label: "Map settings" },
            ]}
          />

          {tab === "browse" && (
            <>
              <div className="map-browse-panel">
                <div className="map-sidebar-fixed">
                  <div className="map-search-row">
                    <Input
                      prefix={<Search size={14} color="#9c97b8" />}
                      value={nameFilter}
                      onChange={(e) => setNameFilter(e.target.value)}
                      placeholder="Search places…"
                      allowClear
                    />
                  </div>

                  <div className="map-filter-row">
                    <Select
                      mode="multiple"
                      allowClear
                      style={{ width: "100%" }}
                      placeholder="Filter by icon"
                      value={iconFilter}
                      onChange={setIconFilter}
                      maxTagCount="responsive"
                      options={PLACE_ICON_CHOICES.map((c) => ({
                        value: c.name,
                        label: (
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <c.icon size={13} />
                            {c.label}
                          </span>
                        ),
                      }))}
                    />
                  </div>

                  <div className="map-filter-row map-distance-row">
                    <Input
                      size="small"
                      value={distCenter}
                      onChange={(e) => setDistCenter(e.target.value)}
                      placeholder="lat, lon"
                      allowClear
                    />
                    <Tooltip title="Use my current location">
                      <Button size="small" icon={<LocateFixed size={13} />} onClick={useMyLocationForDistanceFilter} />
                    </Tooltip>
                    <InputNumber
                      size="small"
                      min={0}
                      value={radiusKm}
                      onChange={(v) => setRadiusKm(v ?? 0)}
                      placeholder="km"
                      className="map-distance-radius"
                    />
                  </div>
                  {allTags.length > 0 && (
                    <div className="map-tag-cloud">
                      {allTags.map((t) => (
                        <Tag.CheckableTag
                          key={t}
                          checked={tagFilter.includes(t)}
                          onChange={(checked) =>
                            setTagFilter(checked ? [...tagFilter, t] : tagFilter.filter((x) => x !== t))
                          }
                        >
                          #{t}
                        </Tag.CheckableTag>
                      ))}
                    </div>
                  )}
                </div>

                <div className="map-place-list">
                  {loading ? (
                    <Text style={{ color: "#9c97b8", fontSize: 13 }}>Loading…</Text>
                  ) : filtered.result.length === 0 ? (
                    <Empty description={<span style={{ color: "#9c97b8" }}>No places match.</span>} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    filtered.result.map((p) => {
                      const { name: iconName, color } = splitIcon(p.icon);
                      const Icon = iconForName(iconName);
                      const isSelected = selectedId === p.id;
                      return (
                        <div
                          key={p.id}
                          className={`map-place-row cursor-target${selectedId === p.id ? " active" : ""}`}
                          onClick={() => selectAndFly(p)}
                        >
                          <div className="map-place-swatch" style={{ ["--sw-color" as any]: color }}>
                            <Icon size={15} color="#fff" />
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="map-place-name">{p.name}</div>
                            {p.description && <div className="map-place-desc">{p.description}</div>}
                          </div>
                          {isSelected && (
                            <div className="map-place-row-actions" onClick={(e) => e.stopPropagation()}>
                              <Tooltip title="Edit">
                                <Button size="small" icon={<Pencil size={13} />} onClick={() => openEdit(p)} />
                              </Tooltip>
                              <Tooltip title="Delete">
                                <Button size="small" danger icon={<Trash2 size={13} />} onClick={() => handleDelete(p.id)} />
                              </Tooltip>
                              <Tooltip title="Directions">
                                <Button
                                  size="small" icon={<Navigation2 size={13} />}
                                  href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`}
                                  target="_blank"
                                />
                              </Tooltip>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}

          {tab === "form" && (
            <div className="map-sidebar-body" style={{ paddingTop: 14 }}>
              <Text style={{ fontSize: 12, color: "#9c97b8" }}>Place name</Text>
              <Input
                style={{ marginTop: 6, marginBottom: 12 }}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Hồ Gươm"
              />

              <div style={{ display: "flex", gap: 10, margin: "6px 0 12px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 12, color: "#9c97b8" }}>Icon</Text>
                  <div style={{ marginTop: 6 }}>
                    <Popover
                      trigger="click"
                      placement="bottomLeft"
                      content={
                        <div className="map-icon-grid" style={{ width: 216, margin: 0 }}>
                          {PLACE_ICON_CHOICES.map((c) => {
                            const Icon = c.icon;
                            return (
                              <Tooltip key={c.name} title={c.label}>
                                <button
                                  type="button"
                                  className={`map-icon-btn${form.iconName === c.name ? " active" : ""}`}
                                  onClick={() => setForm({ ...form, iconName: c.name })}
                                >
                                  <Icon size={16} />
                                </button>
                              </Tooltip>
                            );
                          })}
                        </div>
                      }
                    >
                      <Button className="map-icon-trigger cursor-target" style={{ width: "100%" }}>
                        {(() => {
                          const SelectedIcon = iconForName(form.iconName);
                          return <SelectedIcon size={16} color={form.color} />;
                        })()}
                        <span>{labelForName(form.iconName)}</span>
                      </Button>
                    </Popover>
                  </div>
                </div>

                <div>
                  <Text style={{ fontSize: 12, color: "#9c97b8" }}>Color</Text>
                  <div style={{ marginTop: 6 }}>
                    <ColorPicker
                      value={form.color}
                      onChange={(c) => setForm({ ...form, color: c.toHexString() })}
                      presets={[{ label: "Galaxy", colors: ["#8b6ff5", "#22d3ee", "#e879f9", "#f472b6", "#60a5fa", "#34d399"] }]}
                    />
                  </div>
                </div>
              </div>

              <Space.Compact style={{ width: "100%", marginBottom: 12 }}>
                <Input addonBefore="Lat" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
                <Input addonBefore="Lon" value={form.lon} onChange={(e) => setForm({ ...form, lon: e.target.value })} />
                <Tooltip title="Use my current location">
                  <Button icon={<Crosshair size={15} />} onClick={useMyLocationForForm} />
                </Tooltip>
              </Space.Compact>

              <Text style={{ fontSize: 12, color: "#9c97b8" }}>Tags</Text>
              <AutoComplete
                style={{ width: "100%", marginTop: 6, marginBottom: 4 }}
                value={form.tags}
                options={tagSuggestions(form.tags, allTags).map((t) => ({ value: t, label: `#${t}` }))}
                onChange={(v) => setForm({ ...form, tags: v })}
                onSelect={(v) => setForm({ ...form, tags: applyTagSuggestion(form.tags, v as string) })}
                placeholder="date, food, memory..."
              >
                <Input />
              </AutoComplete>
              {allTags.length > 0 && (
                <div style={{ fontSize: 11.5, color: "#7d78a0", marginBottom: 12 }}>
                  Existing: {allTags.map((t) => `#${t}`).join(", ")}
                </div>
              )}

              <Text style={{ fontSize: 12, color: "#9c97b8" }}>Description</Text>
              <Input.TextArea
                style={{ marginTop: 6 }}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Why this place matters..."
                rows={3}
              />

              <div className="map-form-actions">
                <Button type="primary" block onClick={handleSave}>Save</Button>
                <Button block onClick={closeForm}>Cancel</Button>
              </div>
            </div>
          )}
          {tab === "config" && (
            <div className="map-sidebar-body" style={{ paddingTop: 14 }}>
              <Text style={{ fontSize: 12, color: "#9c97b8" }}>Map mode</Text>
              <div className="map-mode-grid">
                {MAP_MODE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={`map-mode-btn cursor-target${mapMode === opt.value ? " active" : ""}`}
                      onClick={() => updateMapMode(opt.value)}
                    >
                      <Icon size={16} />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              <Text style={{ fontSize: 12, color: "#9c97b8", display: "block", marginTop: 18 }}>Map tools</Text>
              <div className="map-tool-list">
                {MAP_TOOL_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const checked = activeTools.includes(opt.value);
                  return (
                    <div key={opt.value} className="map-tool-row">
                      <span className="map-tool-row-label">
                        <Icon size={15} />
                        {opt.label}
                      </span>
                      <Switch
                        size="small"
                        checked={checked}
                        onChange={(v) =>
                          updateActiveTools(v ? [...activeTools, opt.value] : activeTools.filter((t) => t !== opt.value))
                        }
                      />
                    </div>
                  );
                })}
              </div>

              <Text style={{ fontSize: 11.5, color: "#7d78a0", display: "block", marginTop: 10 }}>
                Measure: click points on the map, double-click to clear. Draw: click-drag on the map to sketch; panning is disabled while it's on.
              </Text>
            </div>
          )}
        </div>

        {/* ---------------- Map ---------------- */}
        <div className={`map-canvas-wrap${fullscreen ? " map-canvas-fullscreen" : ""}`}>
          <div className="map-floating-controls">
            <Tooltip title="My location" placement="left">
              <Button shape="circle" icon={<LocateFixed size={16} />} onClick={useMyLocationOnMap} />
            </Tooltip>
            <Tooltip title="Add place here" placement="left">
              <Button shape="circle" icon={<Plus size={16} />} onClick={() => openAdd()} />
            </Tooltip>
            {fullscreen && (
              <Tooltip title="Exit full screen" placement="left">
                <Button
                  className="cursor-target"
                  shape="circle"
                  icon={<Minimize2 size={16} />}
                  onClick={() => updateActiveTools(activeTools.filter((t) => t !== "fullscreen"))}
                />
              </Tooltip>
            )}
          </div>

          {activeTools.includes("coordinates") && cursorLatLng && (
            <div className="map-coord-badge">
              {cursorLatLng.lat.toFixed(5)}, {cursorLatLng.lng.toFixed(5)}
            </div>
          )}

          {activeTools.includes("measure") && (
            <div className="map-measure-badge">
              <Ruler size={13} />
              {measurePoints.length < 2 ? "Tap the map, or add your location" : `${measuredDistanceKm.toFixed(2)} km`}
              <button className="map-measure-clear cursor-target" onClick={addMeasurePointFromLocation}>
                <LocateFixed size={12} /> My location
              </button>              {measurePoints.length > 0 && (
                <button className="map-measure-clear" onClick={handleMeasureClear}>Clear</button>
              )}
            </div>
          )}

          +{activeTools.includes("draw") && (
            <div className="map-sketch-badge">
              <PenLine size={13} />
              {activeSketch ? `Drawing… ${activeSketch.length} pts` : "Drag on the map, or add points from location"}
              <button className="map-sketch-clear cursor-target" onClick={addSketchPointFromLocation}>
                <LocateFixed size={12} /> My location
              </button>
              {activeSketch && activeSketch.length > 1 && (
                <button className="map-sketch-clear cursor-target" onClick={handleSketchEnd}>Finish</button>
              )}
              {sketchLines.length > 0 && (
                <button className="map-sketch-clear cursor-target" onClick={clearSketches}>Clear</button>
              )}
            </div>
          )}
          <MapContainer ref={mapRef} center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} style={{ height: "100%" }}>
            <TileLayer url={MAP_TILE_CONFIG[mapMode].url} attribution={MAP_TILE_CONFIG[mapMode].attribution} />
            <MapEvents onRightClick={(lat, lon) => openAdd({ lat, lon })} onLeftClick={() => setSelectedId(null)} />
            <MapDragLock locked={activeTools.includes("draw")} />

            {activeTools.includes("coordinates") && (
              <CursorCoordinatesTool onMove={(lat, lng) => setCursorLatLng({ lat, lng })} />
            )}
            {activeTools.includes("measure") && (
              <MeasureTool onAddPoint={handleMeasureAddPoint} onClear={handleMeasureClear} />
            )}
            {activeTools.includes("draw") && (
              <SketchTool onStart={handleSketchStart} onExtend={handleSketchExtend} onEnd={handleSketchEnd} />
            )}

            {measurePoints.length > 1 && (
              <Polyline positions={measurePoints} pathOptions={{ color: "#22d3ee", weight: 3, dashArray: "6 6" }} />
            )}
            {measurePoints.map((pt, i) => (
              <Circle key={`measure-pt-${i}`} center={pt} radius={20} pathOptions={{ color: "#22d3ee", fillColor: "#22d3ee", fillOpacity: 0.9 }} />
            ))}

            {sketchLines.map((line, i) => (
              <Polyline key={`sketch-${i}`} positions={line} pathOptions={{ color: "#e879f9", weight: 3 }} />
            ))}
            {activeSketch && <Polyline positions={activeSketch} pathOptions={{ color: "#e879f9", weight: 3 }} />}
            {(tab === "form" ? places : filtered.result).map((p) => {
              const { name: iconName, color } = splitIcon(p.icon);
              return (
                <Marker
                  key={p.id}
                  position={[p.lat, p.lon]}
                  icon={glowDivIcon(iconName, color)}
                  eventHandlers={{ click: () => setSelectedId(p.id) }}
                >
                  <Popup>
                    <strong>{p.name}</strong>
                    {p.description && <div>{p.description}</div>}
                    <br />
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`} target="_blank" rel="noreferrer">
                      Directions ↗
                    </a>
                  </Popup>
                </Marker>
              );
            })}

            {hasPreview && (
              <Marker position={[previewLat, previewLon]} icon={glowDivIcon(form.iconName, form.color, 0.75)} />
            )}
            {myLocation && (
              <Marker
                position={myLocation}
                icon={L.divIcon({
                  html: '<div style="width:16px;height:16px;border-radius:50%;background:#22d3ee;border:3px solid #fff;box-shadow:0 0 0 3px rgba(34,211,238,0.5);"></div>',
                  className: "", iconSize: [16, 16], iconAnchor: [8, 8],
                })}
              />
            )}
            {filtered.radiusCircle && (
              <Circle
                center={filtered.radiusCircle.center}
                radius={filtered.radiusCircle.radiusKm * 1000}
                pathOptions={{ color: "#8b6ff5", weight: 2, fillOpacity: 0.08 }}
              />
            )}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
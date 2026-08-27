import React, { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Button, Tabs, Input, ColorPicker, Tag, Empty, Tooltip, InputNumber, Typography, Popover, Space,
} from "antd";
import {
  MapPin, Plus, Search, LocateFixed, Pencil, Trash2, Navigation2, X, SlidersHorizontal, Crosshair,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import * as placesService from "../lib/placesService";
import { Place } from "../lib/placesService";
import { PLACE_ICON_CHOICES, iconForName, splitIcon, DEFAULT_ICON_NAME, DEFAULT_COLOR } from "../content/placeIcons";
import "./MapPage.css";

const { Text, Title } = Typography;

// NOT PORTED (flagging honestly, same as before): multiple tile styles,
// draw/sketch tools, heatmap overlay, marker clustering, measure-distance,
// fullscreen/minimap plugins. Core CRUD, right-click-add, search/filter,
// and geolocation all work — now laid out as a fixed left rail + map.

const DEFAULT_CENTER: [number, number] = [16.0, 106.0];
const DEFAULT_ZOOM = 5;

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
    <div class="galaxy-marker" style="--marker-color:${colorHex};opacity:${opacity}">
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

export function MapPage() {
  const { user } = useAuth();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"browse" | "form">("browse");
  const [panelMode, setPanelMode] = useState<"none" | "add" | "edit">("none");
  const [form, setForm] = useState<FormState>(emptyForm());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [myLocation, setMyLocation] = useState<[number, number] | null>(null);

  const [nameFilter, setNameFilter] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [distCenter, setDistCenter] = useState("");
  const [radiusKm, setRadiusKm] = useState(0);

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

  function useMyLocationForForm() {
    if (!navigator.geolocation) { alert("Geolocation not available in this browser."); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setForm((f) => ({ ...f, lat: pos.coords.latitude.toFixed(6), lon: pos.coords.longitude.toFixed(6) })),
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

  const filtered = useMemo(() => {
    let result = places;
    if (nameFilter.trim()) result = result.filter((p) => p.name.toLowerCase().includes(nameFilter.trim().toLowerCase()));
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
  }, [places, nameFilter, tagFilter, distCenter, radiusKm]);

  const selectedPlace = places.find((p) => p.id === selectedId) ?? null;
  const previewLat = parseFloat(form.lat);
  const previewLon = parseFloat(form.lon);
  const hasPreview = tab === "form" && !Number.isNaN(previewLat) && !Number.isNaN(previewLon);

  return (
    <div className="page map-page-shell">
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
            onChange={(k) => { if (k === "browse") closeForm(); else if (panelMode === "none") openAdd(); setTab(k as any); }}
            items={[
              { key: "browse", label: "Browse" },
              { key: "form", label: panelMode === "edit" ? "Edit place" : "Add place" },
            ]}
          />

          {tab === "browse" && (
            <>
              <div className="map-quick-actions">
                <Button type="primary" icon={<Plus size={16} />} onClick={() => openAdd()}>Add place</Button>
                <Tooltip title="Center on my location">
                  <Button icon={<LocateFixed size={16} />} onClick={useMyLocationOnMap} />
                </Tooltip>
              </div>

              <div className="map-sidebar-body">
                <div className="map-search-row">
                  <Space.Compact style={{ width: "100%" }}>
                    <Input
                      prefix={<Search size={14} color="#9c97b8" />}
                      value={nameFilter}
                      onChange={(e) => setNameFilter(e.target.value)}
                      placeholder="Search places…"
                      allowClear
                    />
                    <Popover
                      trigger="click"
                      placement="bottomRight"
                      content={
                        <div style={{ width: 240 }}>
                          <Text style={{ fontSize: 12, color: "#9c97b8" }}>Near a point</Text>
                          <Input
                            style={{ marginTop: 6 }}
                            size="small"
                            value={distCenter}
                            onChange={(e) => setDistCenter(e.target.value)}
                            placeholder="lat, lon"
                          />
                          <Text style={{ fontSize: 12, color: "#9c97b8", display: "block", marginTop: 8 }}>Radius (km)</Text>
                          <InputNumber
                            style={{ width: "100%", marginTop: 6 }}
                            size="small"
                            min={0}
                            value={radiusKm}
                            onChange={(v) => setRadiusKm(v ?? 0)}
                          />
                        </div>
                      }
                    >
                      <Button icon={<SlidersHorizontal size={15} />} />
                    </Popover>
                  </Space.Compact>
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
                        className={`map-place-row${isSelected ? " active" : ""}`}
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

              <Text style={{ fontSize: 12, color: "#9c97b8" }}>Icon</Text>
              <div className="map-icon-grid">
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

              <Text style={{ fontSize: 12, color: "#9c97b8" }}>Color</Text>
              <div style={{ margin: "6px 0 12px" }}>
                <ColorPicker
                  value={form.color}
                  onChange={(c) => setForm({ ...form, color: c.toHexString() })}
                  presets={[{ label: "Galaxy", colors: ["#8b6ff5", "#22d3ee", "#e879f9", "#f472b6", "#60a5fa", "#34d399"] }]}
                />
              </div>

              <Space.Compact style={{ width: "100%", marginBottom: 12 }}>
                <Input addonBefore="Lat" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
                <Input addonBefore="Lon" value={form.lon} onChange={(e) => setForm({ ...form, lon: e.target.value })} />
                <Tooltip title="Use my current location">
                  <Button icon={<Crosshair size={15} />} onClick={useMyLocationForForm} />
                </Tooltip>
              </Space.Compact>

              <Text style={{ fontSize: 12, color: "#9c97b8" }}>Tags</Text>
              <Input
                style={{ marginTop: 6, marginBottom: 4 }}
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="date, food, memory..."
              />
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
        </div>

        {/* ---------------- Map ---------------- */}
        <div className="map-canvas-wrap">
          <div className="map-floating-controls">
            <Tooltip title="My location" placement="left">
              <Button shape="circle" icon={<LocateFixed size={16} />} onClick={useMyLocationOnMap} />
            </Tooltip>
            <Tooltip title="Add place here" placement="left">
              <Button shape="circle" icon={<Plus size={16} />} onClick={() => openAdd()} />
            </Tooltip>
          </div>

          <MapContainer ref={mapRef} center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} style={{ height: "100%" }}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            />
            <MapEvents onRightClick={(lat, lon) => openAdd({ lat, lon })} onLeftClick={() => setSelectedId(null)} />

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
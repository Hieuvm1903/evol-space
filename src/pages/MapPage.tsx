import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAuth } from "../contexts/AuthContext";
import * as placesService from "../lib/placesService";
import { Place } from "../lib/placesService";
import { PLACE_ICON_CHOICES, emojiForIconName, splitIcon, DEFAULT_ICON_NAME, DEFAULT_COLOR } from "../content/placeIcons";

// NOT PORTED from map_page.py (noted honestly, same as Music's deferred
// list): multiple tile styles (Light/Streets/Dark/Satellite/Terrain — this
// uses one dark CartoDB style matching the app's theme), draw/sketch tools,
// heatmap overlay, marker clustering, measure-distance control,
// fullscreen/minimap plugins, double-click-to-zoom animation on markers.
// Core CRUD, right-click-add, search/filter, and geolocation all work.

const DEFAULT_CENTER: [number, number] = [16.0, 106.0];
const DEFAULT_ZOOM = 5;

function emojiDivIcon(emoji: string, colorHex: string): L.DivIcon {
  return L.divIcon({
    html: `<div style="
      width:34px;height:34px;border-radius:50% 50% 50% 0;
      background:${colorHex};transform:rotate(-45deg);
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 2px 5px rgba(0,0,0,0.4);border:2px solid #fff;
    "><span style="transform:rotate(45deg);font-size:17px;line-height:1;">${emoji}</span></div>`,
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });
}

interface FormState {
  editId: number | null; // null = adding new
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
    contextmenu(e) {
      onRightClick(e.latlng.lat, e.latlng.lng);
    },
    click() {
      onLeftClick();
    },
  });
  return null;
}

export function MapPage() {
  const { user } = useAuth();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelMode, setPanelMode] = useState<"none" | "add" | "edit" | "search">("none");
  const [form, setForm] = useState<FormState>(emptyForm());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [myLocation, setMyLocation] = useState<[number, number] | null>(null);

  const [nameFilter, setNameFilter] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [distCenter, setDistCenter] = useState("");
  const [radiusKm, setRadiusKm] = useState(0);

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
        <h2>📍 Places</h2>
        <p>Log in first (see the Login tab) — your places are personal to your account.</p>
      </div>
    );
  }

  function openAdd(prefill?: { lat: number; lon: number }) {
    setForm(emptyForm(prefill));
    setPanelMode("add");
  }

  function openEdit(p: Place) {
    setForm(formFromPlace(p));
    setPanelMode("edit");
  }

  function closePanel() {
    setPanelMode("none");
  }

  async function handleSave() {
    const lat = parseFloat(form.lat);
    const lon = parseFloat(form.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      alert("Couldn't parse latitude/longitude — please check the values.");
      return;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      alert("Latitude must be -90..90 and longitude -180..180.");
      return;
    }
    const icon = `${form.iconName}|${form.color}`;
    const finalName = form.name.trim() || "Untitled place";

    if (form.editId !== null) {
      await placesService.updatePlace(form.editId, finalName, lat, lon, form.description.trim(), icon, form.tags);
    } else {
      await placesService.addPlace(user!.id, finalName, lat, lon, form.description.trim(), icon, form.tags);
    }
    setPanelMode("none");
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
      (pos) => setMyLocation([pos.coords.latitude, pos.coords.longitude]),
      (err) => alert(`Couldn't get your location: ${err.message}`),
    );
  }

  const allTags = useMemo(() => placesService.getAllTags(places), [places]);

  const filtered = useMemo(() => {
    let result = places;
    if (nameFilter.trim()) {
      result = result.filter((p) => p.name.toLowerCase().includes(nameFilter.trim().toLowerCase()));
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
  }, [places, nameFilter, tagFilter, distCenter, radiusKm]);

  const displayPlaces = panelMode === "search" ? filtered.result : places;
  const previewLat = parseFloat(form.lat);
  const previewLon = parseFloat(form.lon);
  const hasPreview = (panelMode === "add" || panelMode === "edit") && !Number.isNaN(previewLat) && !Number.isNaN(previewLon);

  return (
    <div className="page map-page">
      <h2>📍 Places</h2>
      <p className="evol-card-meta">
        Right-click the map to add a place there. Click a marker for details, click elsewhere to deselect.
      </p>

      <div className="music-control-row">
        <button onClick={() => (panelMode === "add" ? closePanel() : openAdd())}>
          {panelMode === "add" ? "✕ Close" : "➕ Add"}
        </button>
        <button onClick={() => (panelMode === "search" ? closePanel() : setPanelMode("search"))}>
          {panelMode === "search" ? "✕ Close" : "🔍 Search"}
        </button>
        <button onClick={useMyLocationOnMap}>🎯 Show my location</button>
      </div>

      <div className={panelMode === "add" || panelMode === "edit" || panelMode === "search" ? "map-layout-split" : ""}>
        {(panelMode === "add" || panelMode === "edit") && (
          <div className="evol-card map-panel">
            <h4>{panelMode === "edit" ? "Edit place" : "➕ Add new place"}</h4>
            <label>Place name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Hồ Gươm" />

            <label>Icon</label>
            <div className="map-icon-grid">
              {PLACE_ICON_CHOICES.map((c) => (
                <button
                  key={c.name}
                  className={form.iconName === c.name ? "active" : ""}
                  onClick={() => setForm({ ...form, iconName: c.name })}
                  title={c.name}
                  type="button"
                >
                  {c.emoji}
                </button>
              ))}
            </div>

            <label>Color</label>
            <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />

            <div className="music-copy-row" style={{ marginTop: 10 }}>
              <div style={{ flex: 1 }}>
                <label>Latitude</label>
                <input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label>Longitude</label>
                <input value={form.lon} onChange={(e) => setForm({ ...form, lon: e.target.value })} />
              </div>
              <button type="button" onClick={useMyLocationForForm} title="Use my current location" style={{ alignSelf: "flex-end" }}>
                🎯
              </button>
            </div>

            <label style={{ marginTop: 10 }}>Tags (comma separated)</label>
            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="date, food, memory..." />
            {allTags.length > 0 && (
              <p className="evol-card-meta">Existing tags: {allTags.map((t) => `#${t}`).join(", ")}</p>
            )}

            <label>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Why this place matters..."
              rows={3}
            />

            <div className="music-copy-row" style={{ marginTop: 12 }}>
              <button onClick={handleSave}>Save</button>
              <button onClick={closePanel}>Cancel</button>
            </div>
          </div>
        )}

        {panelMode === "search" && (
          <div className="evol-card map-panel">
            <h4>🔍 Search places</h4>
            <label>Search by name</label>
            <input value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} placeholder="Search by name..." />

            <label>Filter by tags</label>
            <div className="map-tag-list">
              {allTags.map((t) => (
                <label key={t} className="map-tag-checkbox">
                  <input
                    type="checkbox"
                    checked={tagFilter.includes(t)}
                    onChange={(e) => setTagFilter(e.target.checked ? [...tagFilter, t] : tagFilter.filter((x) => x !== t))}
                  />
                  #{t}
                </label>
              ))}
              {allTags.length === 0 && <span className="evol-card-meta">No tags yet.</span>}
            </div>

            <label style={{ marginTop: 10 }}>Center location (lat, lon)</label>
            <input value={distCenter} onChange={(e) => setDistCenter(e.target.value)} placeholder="21.0285, 105.8542" />
            <label>Radius (km)</label>
            <input type="number" min={0} value={radiusKm} onChange={(e) => setRadiusKm(parseFloat(e.target.value) || 0)} />

            <div className="map-results-list">
              {filtered.result.length === 0 ? (
                <p className="placeholder-note">No places match your filters.</p>
              ) : (
                filtered.result.map((p) => {
                  const { name: iconName } = splitIcon(p.icon);
                  return (
                    <button
                      key={p.id}
                      className={`map-result-row${selectedId === p.id ? " active" : ""}`}
                      onClick={() => setSelectedId(p.id)}
                    >
                      {emojiForIconName(iconName)} {p.name}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        <div className="map-container-wrap">
          <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} style={{ height: 520, borderRadius: 12 }}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            />
            <MapEvents
              onRightClick={(lat, lon) => openAdd({ lat, lon })}
              onLeftClick={() => setSelectedId(null)}
            />
            {displayPlaces.map((p) => {
              const { name: iconName, color } = splitIcon(p.icon);
              return (
                <Marker
                  key={p.id}
                  position={[p.lat, p.lon]}
                  icon={emojiDivIcon(emojiForIconName(iconName), color)}
                  eventHandlers={{ click: () => setSelectedId(p.id) }}
                >
                  <Popup>
                    <strong>{p.name}</strong>
                    {p.description && <div>{p.description}</div>}
                    <br />
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`}
                      target="_blank" rel="noreferrer"
                    >
                      🧭 Directions
                    </a>
                  </Popup>
                </Marker>
              );
            })}
            {hasPreview && (
              <Marker
                position={[previewLat, previewLon]}
                icon={emojiDivIcon(emojiForIconName(form.iconName), form.color)}
                opacity={0.75}
              />
            )}
            {myLocation && (
              <Marker
                position={myLocation}
                icon={L.divIcon({
                  html: '<div style="width:16px;height:16px;border-radius:50%;background:#4285F4;border:3px solid #fff;box-shadow:0 0 0 2px #4285F4;"></div>',
                  className: "", iconSize: [16, 16], iconAnchor: [8, 8],
                })}
              />
            )}
            {filtered.radiusCircle && (
              <Circle
                center={filtered.radiusCircle.center}
                radius={filtered.radiusCircle.radiusKm * 1000}
                pathOptions={{ color: "#02ab21", weight: 2, fillOpacity: 0.08 }}
              />
            )}
          </MapContainer>
        </div>
      </div>

      {selectedId !== null && (() => {
        const place = places.find((p) => p.id === selectedId);
        if (!place) return null;
        const { name: iconName } = splitIcon(place.icon);
        return (
          <div className="evol-card map-selected-bar">
            <strong>{emojiForIconName(iconName)} Selected: {place.name}</strong>
            <div className="music-playlist-actions">
              <button onClick={() => openEdit(place)}>Edit</button>
              <button onClick={() => handleDelete(place.id)}>Delete</button>
              <a
                className="map-directions-btn"
                href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`}
                target="_blank" rel="noreferrer"
              >
                🧭
              </a>
              <button onClick={() => setSelectedId(null)}>✕</button>
            </div>
          </div>
        );
      })()}

      {loading && <p className="placeholder-note">Loading…</p>}
    </div>
  );
}

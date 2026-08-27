import React, { useEffect, useMemo, useRef, useState } from "react";
import { Tabs, Typography } from "antd";
import { MapPin } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAuth } from "../../contexts/AuthContext";
import * as placesService from "../../lib/placesService";
import { Place } from "../../lib/placesService";
import { splitIcon } from "../../content/placeIcons";
import "./MapPage.css";
import TargetCursor from "../../components/TargetCursor";

import { MAP_MODE_KEY, MAP_TOOLS_KEY, readMapMode, readMapTools } from "./constants";
import type { MapMode, MapTool, FormState } from "./types";
import { emptyForm, formFromPlace } from "./formHelpers";
import BrowseTab from "./BrowseTab";
import PlaceFormTab from "./PlaceFormTab";
import MapSettingsTab from "./MapSettingsTab";
import MapCanvas from "./MapCanvas";

const { Title } = Typography;

// NOT PORTED (flagging honestly, same as before): multiple tile styles,
// draw/sketch tools, heatmap overlay, marker clustering, measure-distance,
// fullscreen/minimap plugins. Core CRUD, right-click-add, search/filter,
// and geolocation all work — now laid out as a fixed left rail + map.
//
// This file used to hold everything (~750 lines). It's now split into
// ./map/*: types, constants, marker-icon + form helpers, the Leaflet
// event-listener components, the three sidebar tabs, and the map canvas
// itself. This file just owns state and wires them together.

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
  const [activeSketch, setActiveSketch] = useState<[number, number][] | null>(null);
  const [panelMode, setPanelMode] = useState<"none" | "add" | "edit">("none");
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

  const displayedPlaces = tab === "form" ? places : filtered.result;

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
            <BrowseTab
              loading={loading}
              places={filtered.result}
              nameFilter={nameFilter}
              onNameFilterChange={setNameFilter}
              iconFilter={iconFilter}
              onIconFilterChange={setIconFilter}
              distCenter={distCenter}
              onDistCenterChange={setDistCenter}
              onUseMyLocationForDistance={useMyLocationForDistanceFilter}
              radiusKm={radiusKm}
              onRadiusKmChange={setRadiusKm}
              allTags={allTags}
              tagFilter={tagFilter}
              onTagFilterChange={setTagFilter}
              selectedId={selectedId}
              onSelectAndFly={selectAndFly}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          )}

          {tab === "form" && (
            <PlaceFormTab
              form={form}
              onFormChange={setForm}
              allTags={allTags}
              onUseMyLocation={useMyLocationForForm}
              onSave={handleSave}
              onCancel={closeForm}
            />
          )}

          {tab === "config" && (
            <MapSettingsTab
              mapMode={mapMode}
              onMapModeChange={updateMapMode}
              activeTools={activeTools}
              onActiveToolsChange={updateActiveTools}
            />
          )}
        </div>

        {/* ---------------- Map ---------------- */}
        <MapCanvas
          mapRef={mapRef}
          fullscreen={fullscreen}
          mapMode={mapMode}
          activeTools={activeTools}
          onExitFullscreen={() => updateActiveTools(activeTools.filter((t) => t !== "fullscreen"))}
          cursorLatLng={cursorLatLng}
          onCursorMove={(lat, lng) => setCursorLatLng({ lat, lng })}
          measurePoints={measurePoints}
          measuredDistanceKm={measuredDistanceKm}
          onMeasureAddPoint={handleMeasureAddPoint}
          onMeasureClear={handleMeasureClear}
          onAddMeasurePointFromLocation={addMeasurePointFromLocation}
          sketchLines={sketchLines}
          activeSketch={activeSketch}
          onSketchStart={handleSketchStart}
          onSketchExtend={handleSketchExtend}
          onSketchEnd={handleSketchEnd}
          onAddSketchPointFromLocation={addSketchPointFromLocation}
          onClearSketches={clearSketches}
          onRightClickAdd={(lat, lon) => openAdd({ lat, lon })}
          onLeftClickDeselect={() => setSelectedId(null)}
          displayedPlaces={displayedPlaces}
          onSelectPlace={setSelectedId}
          form={form}
          hasPreview={hasPreview}
          previewLat={previewLat}
          previewLon={previewLon}
          myLocation={myLocation}
          radiusCircle={filtered.radiusCircle}
          onUseMyLocationOnMap={useMyLocationOnMap}
          onOpenAdd={() => openAdd()}
        />
      </div>
    </div>
  );
}

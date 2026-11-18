import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Tabs, Typography } from "antd";
import { MapPin, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAuth } from "../../contexts/AuthContext";
import * as placesService from "../../lib/placesService";
import { Place } from "../../lib/placesService";
import * as listsService from "../../lib/placeListsService";
import { splitIcon } from "../../content/placeIcons";
import "./MapPage.css";
import TargetCursor from "../../components/TargetCursor";
import { useConfirm } from "../../components/ConfirmDialog";
import { notify } from "../../lib/notify";
import { useLongPressSelect } from "../../hooks/useLongPressSelect";
import SelectionToolbar from "../../components/SelectionToolbar";

import { MAP_MODE_KEY, MAP_TOOLS_KEY, readMapMode, readMapTools } from "./constants";
import type { MapMode, MapTool, FormState, SortOption } from "./types";
import { emptyForm, formFromPlace } from "./formHelpers";
import BrowseTab from "./BrowseTab";
import PlaceFormTab from "./PlaceFormTab";
import MapSettingsTab from "./MapSettingsTab";
import MapCanvas from "./MapCanvas";
import ListsTab from "./ListsTab";

const { Title } = Typography;

export function MapPage() {
  const [tab, setTab] = useState<"browse" | "lists" | "form" | "config">("browse");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [listDraftIds, setListDraftIds] = useState<number[] | null>(null);
  const [activeListIds, setActiveListIds] = useState<number[] | null>(null);
  const [activeListId, setActiveListId] = useState<number | null>(null);
  const [activeListName, setActiveListName] = useState<string | null>(null);
  const { user } = useAuth();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPlace, setSavingPlace] = useState(false);
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
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [nameFilter, setNameFilter] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [distCenter, setDistCenter] = useState("");
  const [radiusKm, setRadiusKm] = useState(0);
  const [iconFilter, setIconFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const mapRef = useRef<L.Map | null>(null);

  const confirmDialog = useConfirm();
  const longPress = useLongPressSelect<number>();

  async function load() {
    if (!user) return;
    setLoading(true);
    try {
      setPlaces(await placesService.getPlaces(user.id));
    } catch {
      notify.error("Couldn't load your places", "Please try refreshing.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setTimeout(() => mapRef.current?.invalidateSize(), 240);
    return () => clearTimeout(id);
  }, [fullscreen, sidebarOpen]);

  useEffect(() => {
    if (!fullscreen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        updateActiveTools(activeTools.filter((t) => t !== "fullscreen"));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen, activeTools]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (nameFilter.trim()) {
      const q = nameFilter.trim().toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q),
      );
    }
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
    let distOrigin: [number, number] | null = null;
    if (distCenter.trim()) {
      const parts = distCenter.split(",").map((s) => parseFloat(s.trim()));
      if (parts.length === 2 && !parts.some(Number.isNaN)) {
        distOrigin = [parts[0], parts[1]];
        if (radiusKm > 0) {
          radiusCircle = { center: distOrigin, radiusKm };
          result = result.filter((p) => placesService.haversineKm(distOrigin![0], distOrigin![1], p.lat, p.lon) <= radiusKm);
        }
      }
    }

    const sorted = [...result];
    switch (sortBy) {
      case "newest":
        sorted.sort((a, b) => b.id - a.id);
        break;
      case "oldest":
        sorted.sort((a, b) => a.id - b.id);
        break;
      case "name-asc":
        sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
        break;
      case "name-desc":
        sorted.sort((a, b) => b.name.localeCompare(a.name, undefined, { sensitivity: "base" }));
        break;
      case "distance":
        if (distOrigin) {
          sorted.sort((a, b) =>
            placesService.haversineKm(distOrigin![0], distOrigin![1], a.lat, a.lon) -
            placesService.haversineKm(distOrigin![0], distOrigin![1], b.lat, b.lon),
          );
        }
        break;
    }

    return { result: sorted, radiusCircle };
  }, [places, nameFilter, iconFilter, tagFilter, distCenter, radiusKm, sortBy]);

  const displayedPlaces = useMemo(() => {
    let list = tab === "form" || tab === "lists" ? places : filtered.result;
    if (activeListIds) list = list.filter((p) => activeListIds.includes(p.id));
    return list;
  }, [tab, places, filtered.result, activeListIds]);

  const selectedPlace = useMemo(
    () => (selectedId === null ? null : places.find((p) => p.id === selectedId) ?? null),
    [places, selectedId],
  );

  if (!user) {
    return (
      <div className="page">
        <h2><MapPin size={22} style={{ verticalAlign: -4, marginRight: 8 }} />Places</h2>
        <p>Log in first (see the Login tab) — your places are personal to your account.</p>
      </div>
    );
  }

  async function handleViewList(ids: number[] | null, listId?: number) {
    setActiveListIds(ids);
    setActiveListId(ids ? listId ?? null : null);
    if (ids && listId) {
      try {
        const allLists = await listsService.getPlaceLists(user!.id);
        setActiveListName(allLists.find((l) => l.id === listId)?.name ?? "Saved list");
      } catch {
        setActiveListName("Saved list");
      }
    } else {
      setActiveListName(null);
    }
    if (ids && ids.length) {
      const pts = places.filter((p) => ids.includes(p.id)).map((p) => [p.lat, p.lon] as [number, number]);
      if (pts.length) mapRef.current?.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 15 });
    }
  }

  function handleCreateListFromSelection() {
    const ids = Array.from(longPress.selectedIds);
    if (!ids.length) return;
    setListDraftIds(ids);
    longPress.exitSelectMode();
    setSidebarOpen(true);
    setTab("lists");
  }

  function openAdd(prefill?: { lat: number; lon: number; name?: string }) {
    const next = emptyForm(prefill);
    if (prefill?.name) next.name = prefill.name;
    setForm(next);
    setPanelMode("add");
    setSidebarOpen(true);
    setTab("form");
  }

  function openEdit(p: Place) {
    setForm(formFromPlace(p));
    setPanelMode("edit");
    setSidebarOpen(true);
    setTab("form");
  }

  function closeForm() {
    setPanelMode("none");
    setTab("browse");
  }

  async function handleSave() {
    const lat = parseFloat(form.lat);
    const lon = parseFloat(form.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      notify.error("Invalid coordinates", "Couldn't parse latitude/longitude — please check the values.");
      return;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      notify.error("Coordinates out of range", "Latitude must be -90..90 and longitude -180..180.");
      return;
    }
    const icon = `${form.iconName}|${form.color}`;
    const finalName = form.name.trim() || "Untitled place";
    const isEdit = form.editId !== null;

    setSavingPlace(true);
    try {
      if (isEdit) {
        await placesService.updatePlace(form.editId!, finalName, lat, lon, form.description.trim(), icon, form.tags);
        notify.updated(`"${finalName}" saved.`);
      } else {
        await placesService.addPlace(user!.id, finalName, lat, lon, form.description.trim(), icon, form.tags);
        notify.added(`"${finalName}" added to the map.`);
      }
      closeForm();
      await load();
      mapRef.current?.flyTo([lat, lon], 15, { duration: 0.6 });
    } catch {
      notify.error("Couldn't save place", "Please try again.");
    } finally {
      setSavingPlace(false);
    }
  }

  async function handleDelete(placeId: number) {
    const ok = await confirmDialog({
      title: "Delete this place?",
      description: "This can't be undone.",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await placesService.deletePlace(placeId, user!.id);
      if (selectedId === placeId) setSelectedId(null);
      notify.deleted("Place removed.");
      load();
    } catch {
      notify.error("Couldn't delete place", "Please try again.");
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(longPress.selectedIds);
    if (ids.length === 0) return;
    const ok = await confirmDialog({
      title: `Delete ${ids.length} place${ids.length === 1 ? "" : "s"}?`,
      description: "This can't be undone.",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;

    setBulkDeleting(true);
    try {
      await placesService.deletePlaces(ids, user!.id);
      notify.deleted(`${ids.length} place${ids.length === 1 ? "" : "s"} removed.`);
      if (selectedId !== null && ids.includes(selectedId)) setSelectedId(null);
      longPress.exitSelectMode();
      load();
    } catch {
      notify.error("Couldn't delete selected places", "Please try again.");
    } finally {
      setBulkDeleting(false);
    }
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
    if (!navigator.geolocation) {
      notify.error("Geolocation unavailable", "Geolocation is not supported in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => handleMeasureAddPoint(pos.coords.latitude, pos.coords.longitude),
      (err) => notify.error("Couldn't get your location", err.message),
    );
  }

  function handleSketchStart(lat: number, lng: number) {
    setActiveSketch([[lat, lng]]);
  }

  function handleSketchExtend(lat: number, lng: number) {
    setActiveSketch((line) => {
      if (!line) return [[lat, lng]];
      const [pl, pn] = line[line.length - 1];
      if (Math.abs(pl - lat) < 0.00002 && Math.abs(pn - lng) < 0.00002) return line;
      return [...line, [lat, lng]];
    });
  }

  function handleSketchEnd() {
    setActiveSketch((line) => {
      if (line && line.length > 1) setSketchLines((all) => [...all, line]);
      return null;
    });
  }

  function addSketchPointFromLocation() {
    if (!navigator.geolocation) {
      notify.error("Geolocation unavailable", "Geolocation is not supported in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => handleSketchExtend(pos.coords.latitude, pos.coords.longitude),
      (err) => notify.error("Couldn't get your location", err.message),
    );
  }

  function clearSketches() {
    setSketchLines([]);
    setActiveSketch(null);
  }

  function useMyLocationForForm() {
    if (!navigator.geolocation) {
      notify.error("Geolocation unavailable", "Geolocation is not supported in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setForm((f) => ({ ...f, lat: pos.coords.latitude.toFixed(6), lon: pos.coords.longitude.toFixed(6) })),
      (err) => notify.error("Couldn't get your location", err.message),
    );
  }

  function useMyLocationForDistanceFilter() {
    if (!navigator.geolocation) {
      notify.error("Geolocation unavailable", "Geolocation is not supported in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setDistCenter(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`),
      (err) => notify.error("Couldn't get your location", err.message),
    );
  }

  function useMyLocationOnMap() {
    if (!navigator.geolocation) {
      notify.error("Geolocation unavailable", "Geolocation is not supported in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setMyLocation(c);
        mapRef.current?.flyTo(c, 13, { duration: 0.7 });
      },
      (err) => notify.error("Couldn't get your location", err.message),
    );
  }

  function fitAllDisplayedPlaces() {
    if (!displayedPlaces.length) return;
    const pts = displayedPlaces.map((p) => [p.lat, p.lon] as [number, number]);
    mapRef.current?.fitBounds(L.latLngBounds(pts), { padding: [54, 54], maxZoom: 15 });
  }

  function clearAllFilters() {
    setNameFilter("");
    setIconFilter([]);
    setTagFilter([]);
    setDistCenter("");
    setRadiusKm(0);
    setSortBy("newest");
  }

  function selectAndFly(p: Place) {
    setSelectedId(p.id);
    mapRef.current?.flyTo([p.lat, p.lon], 15, { duration: 0.6 });
  }

  const previewLat = parseFloat(form.lat);
  const previewLon = parseFloat(form.lon);
  const hasPreview = tab === "form" && !Number.isNaN(previewLat) && !Number.isNaN(previewLon);

  return (
    <div className="page map-page-shell">
      <TargetCursor targetSelector=".cursor-target" />
      <div className="map-page-header">
        <div>
          <div className="map-page-heading">
            <Title level={3} style={{ margin: 0 }}>
              <MapPin size={22} style={{ verticalAlign: -4, marginRight: 8, color: "#8b6ff5" }} />
              Places
            </Title>
          </div>
          <p className="map-page-sub">
            Search any address on the map, right-click to drop a pin, or organize places into shareable lists.
          </p>
        </div>

        <div className="map-page-header-actions">
          <Button
            size="small"
            icon={sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
            onClick={() => setSidebarOpen((v) => !v)}
          >
            {sidebarOpen ? "Hide panel" : "Show panel"}
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<Plus size={14} />}
            onClick={() => openAdd()}
          >
            Add place
          </Button>
        </div>
      </div>

      <div className={`map-layout${sidebarOpen ? "" : " sidebar-collapsed"}`}>
        {/* ---------------- Left rail ---------------- */}
        {sidebarOpen && (
          <div className="map-sidebar">
            <Tabs
              className="map-sidebar-tabs"
              activeKey={tab}
              onChange={(k) => {
                if (k === "browse") closeForm();
                else if (k === "form" && panelMode === "none") openAdd();
                if (k !== "browse") longPress.exitSelectMode();
                setTab(k as any);
              }}
              items={[
                { key: "browse", label: "Browse" },
                { key: "lists", label: "Lists" },
                { key: "form", label: panelMode === "edit" ? "Edit place" : "Add place" },
                { key: "config", label: "Settings" },
              ]}
            />
            {tab === "lists" && (
              <ListsTab
                userId={user.id}
                places={places}
                draftIds={listDraftIds}
                onDraftConsumed={() => setListDraftIds(null)}
                activeIds={activeListIds}
                activeListId={activeListId}
                onViewList={handleViewList}
              />
            )}
            {tab === "browse" && (
              <BrowseTab
                loading={loading}
                totalCount={places.length}
                places={filtered.result}
                nameFilter={nameFilter}
                onNameFilterChange={setNameFilter}
                iconFilter={iconFilter}
                onIconFilterChange={setIconFilter}
                sortBy={sortBy}
                onSortByChange={setSortBy}
                distCenter={distCenter}
                onDistCenterChange={setDistCenter}
                onUseMyLocationForDistance={useMyLocationForDistanceFilter}
                radiusKm={radiusKm}
                onRadiusKmChange={setRadiusKm}
                allTags={allTags}
                tagFilter={tagFilter}
                onTagFilterChange={setTagFilter}
                onClearFilters={clearAllFilters}
                onFitAll={fitAllDisplayedPlaces}
                selectedId={selectedId}
                onSelectAndFly={selectAndFly}
                onEdit={openEdit}
                onDelete={handleDelete}
                longPress={longPress}
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
                saving={savingPlace}
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
        )}

        {/* ---------------- Map ---------------- */}
        <MapCanvas
          mapRef={mapRef}
          fullscreen={fullscreen}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
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
          selectedPlace={selectedPlace}
          onEditSelected={openEdit}
          onDeleteSelected={handleDelete}
          onTagClick={(t) => {
            setTagFilter((cur) => (cur.includes(t) ? cur : [...cur, t]));
            setSidebarOpen(true);
            setTab("browse");
          }}
          form={form}
          hasPreview={hasPreview}
          previewLat={previewLat}
          previewLon={previewLon}
          myLocation={myLocation}
          radiusCircle={filtered.radiusCircle}
          onUseMyLocationOnMap={useMyLocationOnMap}
          onFitAll={fitAllDisplayedPlaces}
          onOpenAdd={openAdd}
          activeListName={activeListName}
          onClearActiveList={() => handleViewList(null)}
          selectedId={selectedId}
        />
      </div>

      {tab === "browse" && longPress.selectMode && (
        <SelectionToolbar
          count={longPress.selectedCount}
          total={filtered.result.length}
          itemLabel="place"
          deleting={bulkDeleting}
          onSelectAll={() => longPress.selectAll(filtered.result.map((p) => p.id))}
          onClearSelection={longPress.clearSelection}
          onCancel={longPress.exitSelectMode}
          onDelete={handleBulkDelete}
          onCreateList={handleCreateListFromSelection}
        />
      )}
    </div>
  );
}
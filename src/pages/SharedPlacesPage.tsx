import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button, Empty, Skeleton, Tabs, Typography } from "antd";
import { MapPin, Download, LogIn } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { fetchSharedPlaceList, importSharedPlaceList, type SharedPlaceList } from "../lib/placeListsService";
import type { Place } from "../lib/placesService";
import * as placesService from "../lib/placesService";
import { notify } from "../lib/notify";
import { useLongPressSelect } from "../hooks/useLongPressSelect";
import TargetCursor from "../components/TargetCursor";
import { PanelEdgeToggle } from "../components/PanelEdgeToggle";
import BrowseTab from "./map/BrowseTab";
import MapSettingsTab from "./map/MapSettingsTab";
import MapCanvas from "./map/MapCanvas";
import { usePlaceFilters } from "./map/usePlaceFilters";
import { emptyForm } from "./map/formHelpers";
import { DEFAULT_CENTER, DEFAULT_ZOOM, MAP_MODE_KEY, MAP_TOOLS_KEY, readMapMode, readMapTools, computeViewForPoints } from "./map/constants";
import type { MapMode, MapTool, MapView } from "./map/types";
import "./map/MapPage.css";

const { Title } = Typography;

function FitBounds({ points, fittedRef }: { points: [number, number][]; fittedRef: React.MutableRefObject<boolean> }) {
  const map = useMap();
  useEffect(() => {
    if (points.length && !fittedRef.current) {
      fittedRef.current = true;
      map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 15 });
    }
  }, [points, map, fittedRef]);
  return null;
}

export function SharedPlacesPage() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const mapRef = useRef<L.Map | null>(null);

  const [data, setData] = useState<SharedPlaceList | null | undefined>(undefined);
  const [importing, setImporting] = useState(false);
  const [tab, setTab] = useState<"browse" | "config">("browse");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [mapMode, setMapMode] = useState<MapMode>(readMapMode);
  const [mapView, setMapView] = useState<MapView>({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
  const fittedRef = useRef(false);
  const [activeTools, setActiveTools] = useState<MapTool[]>(readMapTools);
  const [fullscreen, setFullscreen] = useState(false);
  const [cursorLatLng, setCursorLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);
  const [sketchLines, setSketchLines] = useState<[number, number][][]>([]);
  const [activeSketch, setActiveSketch] = useState<[number, number][] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [myLocation, setMyLocation] = useState<[number, number] | null>(null);

  const longPress = useLongPressSelect<number>();

  useEffect(() => {
    if (!token) return;
    fetchSharedPlaceList(token).then(setData).catch(() => setData(null));
  }, [token]);

  const places: Place[] = useMemo(
    () => (data?.places ?? []).map((p, i) => ({
      id: i + 1, user_id: "", name: p.name, lat: p.lat, lon: p.lon,
      description: p.description ?? "", icon: p.icon ?? "", tags: p.tags ?? "", time: "",
    })),
    [data],
  );
  const points = useMemo(() => places.map((p) => [p.lat, p.lon] as [number, number]), [places]);
  useEffect(() => {
    if (points.length && !fittedRef.current) {
      setMapView(computeViewForPoints(points, 15));
      if (mapMode === "google") fittedRef.current = true;
    }
  }, [points, mapMode]);
  const filters = usePlaceFilters(places);
  const blankForm = useMemo(() => emptyForm(), []);
  const selectedPlace = useMemo(
    () => (selectedId === null ? null : places.find((p) => p.id === selectedId) ?? null),
    [places, selectedId],
  );

  const measuredDistanceKm = useMemo(() => {
    let total = 0;
    for (let i = 1; i < measurePoints.length; i++) {
      total += placesService.haversineKm(
        measurePoints[i - 1][0], measurePoints[i - 1][1], measurePoints[i][0], measurePoints[i][1],
      );
    }
    return total;
  }, [measurePoints]);

  useEffect(() => {
    const id = setTimeout(() => mapRef.current?.invalidateSize(), 240);
    return () => clearTimeout(id);
  }, [fullscreen, sidebarOpen]);

  function updateMapMode(mode: MapMode) {
    setMapMode(mode);
    try { localStorage.setItem(MAP_MODE_KEY, mode); } catch { }
  }
  function updateActiveTools(tools: MapTool[]) {
    setActiveTools(tools);
    try { localStorage.setItem(MAP_TOOLS_KEY, JSON.stringify(tools)); } catch { }
    setFullscreen(tools.includes("fullscreen"));
    if (!tools.includes("measure")) setMeasurePoints([]);
    if (!tools.includes("draw")) setActiveSketch(null);
  }

  useEffect(() => {
    if (!fullscreen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") updateActiveTools(activeTools.filter((t) => t !== "fullscreen"));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen, activeTools]); // eslint-disable-line react-hooks/exhaustive-deps

  function withLocation(cb: (lat: number, lng: number) => void) {
    if (!navigator.geolocation) {
      notify.error("Geolocation unavailable", "Geolocation is not supported in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => cb(pos.coords.latitude, pos.coords.longitude),
      (err) => notify.error("Couldn't get your location", err.message),
    );
  }
  const addMeasurePoint = (lat: number, lng: number) => setMeasurePoints((pts) => [...pts, [lat, lng]]);
  const extendSketch = (lat: number, lng: number) =>
    setActiveSketch((line) => (line ? [...line, [lat, lng]] : [[lat, lng]]));
  function endSketch() {
    setActiveSketch((line) => {
      if (line && line.length > 1) setSketchLines((all) => [...all, line]);
      return null;
    });
  }

  function fitAll() {
    if (!filters.result.length) return;
    const pts = filters.result.map((p) => [p.lat, p.lon] as [number, number]);
    setMapView(computeViewForPoints(pts, 15));
    mapRef.current?.fitBounds(L.latLngBounds(pts), { padding: [54, 54], maxZoom: 15 });
  }

  function selectAndFly(p: Place) {
    setSelectedId(p.id);
    setMapView({ center: [p.lat, p.lon], zoom: 15 });
    mapRef.current?.flyTo([p.lat, p.lon], 15, { duration: 0.6 });
  }

  async function handleImport() {
    if (!token) return;
    setImporting(true);
    try {
      await importSharedPlaceList(token);
      notify.added(`"${data?.name}" saved to your places.`);
      navigate("/map");
    } catch {
      notify.error("Couldn't save this list", "The link may have been turned off.");
    } finally { setImporting(false); }
  }

  if (data === undefined) return <div className="page"><Skeleton active paragraph={{ rows: 6 }} /></div>;
  if (data === null) {
    return (
      <div className="page">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="This list link is invalid or sharing was turned off."
        />
      </div>
    );
  }

  return (
    <div className="page map-page-shell">
      <TargetCursor targetSelector=".cursor-target" />

      <div className="map-page-heading" style={{ justifyContent: "space-between" }}>
        <Title level={3} style={{ margin: 0 }}>
          <MapPin size={22} style={{ verticalAlign: -4, marginRight: 8, color: "#8b6ff5" }} />
          {data.name}
        </Title>
        {user ? (
          <Button
            type="primary"
            className="btn-glow"
            icon={<Download size={14} />}
            loading={importing}
            onClick={handleImport}
          >
            Save all to my places
          </Button>
        ) : (
          <Link to="/login"><Button icon={<LogIn size={14} />}>Log in to save a copy</Button></Link>
        )}
      </div>
      <p className="map-page-sub" style={{ marginBottom: 12 }}>
        {data.owner ? `Shared by ${data.owner} · ` : ""}
        {places.length} place{places.length === 1 ? "" : "s"}
        {data.description ? ` · ${data.description}` : ""}
      </p>

      <div className={`map-layout${sidebarOpen ? "" : " sidebar-collapsed"}`}>
        <div className={`map-side-wrap${sidebarOpen ? "" : " collapsed"}`}>
          {sidebarOpen && (
            <div className="map-sidebar">
            <Tabs
              className="map-sidebar-tabs"
              activeKey={tab}
              onChange={(k) => setTab(k as "browse" | "config")}
              items={[
                { key: "browse", label: "Browse" },
                { key: "config", label: "Settings" },
              ]}
            />

            {tab === "browse" && (
              <BrowseTab
                readOnly
                loading={false}
                totalCount={places.length}
                places={filters.result}
                nameFilter={filters.nameFilter}
                onNameFilterChange={filters.setNameFilter}
                iconFilter={filters.iconFilter}
                onIconFilterChange={filters.setIconFilter}
                sortBy={filters.sortBy}
                onSortByChange={filters.setSortBy}
                distCenter={filters.distCenter}
                onDistCenterChange={filters.setDistCenter}
                onUseMyLocationForDistance={filters.fillDistanceFromMyLocation}
                radiusKm={filters.radiusKm}
                onRadiusKmChange={filters.setRadiusKm}
                allTags={filters.allTags}
                tagFilter={filters.tagFilter}
                onTagFilterChange={filters.setTagFilter}
                onClearFilters={filters.clearFilters}
                onFitAll={fitAll}
                selectedId={selectedId}
                onSelectAndFly={selectAndFly}
                longPress={longPress}
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
          <PanelEdgeToggle
            collapsed={!sidebarOpen}
            onToggle={() => setSidebarOpen((v) => !v)}
            side="left"
            label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            className="map-side-edge"
          />
        </div>

        <MapCanvas
          readOnly
          mapRef={mapRef}
          fullscreen={fullscreen}
          mapMode={mapMode}
          mapView={mapView}
          onMapViewChange={setMapView}
          activeTools={activeTools}
          onExitFullscreen={() => updateActiveTools(activeTools.filter((t) => t !== "fullscreen"))}
          cursorLatLng={cursorLatLng}
          onCursorMove={(lat, lng) => setCursorLatLng({ lat, lng })}
          measurePoints={measurePoints}
          measuredDistanceKm={measuredDistanceKm}
          onMeasureAddPoint={addMeasurePoint}
          onMeasureClear={() => setMeasurePoints([])}
          onAddMeasurePointFromLocation={() => withLocation(addMeasurePoint)}
          sketchLines={sketchLines}
          activeSketch={activeSketch}
          onSketchStart={(lat, lng) => setActiveSketch([[lat, lng]])}
          onSketchExtend={extendSketch}
          onSketchEnd={endSketch}
          onAddSketchPointFromLocation={() => withLocation(extendSketch)}
          onClearSketches={() => { setSketchLines([]); setActiveSketch(null); }}
          onRightClickAdd={() => {}}
          onLeftClickDeselect={() => setSelectedId(null)}
          displayedPlaces={filters.result}
          onSelectPlace={setSelectedId}
          selectedPlace={selectedPlace}
          onTagClick={(t) => {
            filters.setTagFilter((cur) => (cur.includes(t) ? cur : [...cur, t]));
            setSidebarOpen(true);
            setTab("browse");
          }}
          form={blankForm}
          hasPreview={false}
          previewLat={0}
          previewLon={0}
          myLocation={myLocation}
          radiusCircle={filters.radiusCircle}
          onUseMyLocationOnMap={() =>
            withLocation((lat, lng) => {
              setMyLocation([lat, lng]);
              setMapView({ center: [lat, lng], zoom: 13 });
              mapRef.current?.flyTo([lat, lng], 13, { duration: 0.7 });
            })
          }
          onFitAll={fitAll}
          onOpenAdd={() => {}}
          selectedId={selectedId}
        >
          <FitBounds points={points} fittedRef={fittedRef} />
        </MapCanvas>
      </div>
    </div>
  );
}
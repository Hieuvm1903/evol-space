import React, { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline } from "react-leaflet";
import L from "leaflet";
import { Button, Input, Tooltip } from "antd";
import {
  LocateFixed, Plus, Minimize2, Ruler, PenLine, Search, X,
  Scan, Copy, Check, Pencil, Navigation2, Trash2,
  ZoomIn, ZoomOut,
} from "lucide-react";
import type { Place } from "../../lib/placesService";
import { iconForName, splitIcon } from "../../content/placeIcons";
import { glowDivIcon } from "./mapIcons";
import { MapEvents, MapDragLock, CursorCoordinatesTool, MeasureTool, SketchTool } from "./MapEventHandlers";
import { DEFAULT_CENTER, DEFAULT_ZOOM, MAP_TILE_CONFIG } from "./constants";
import type { MapMode, MapTool, FormState } from "./types";
import PlaceMarkers from "./PlaceMarkers";
import MarkerClusterGroup from "react-leaflet-cluster";
import { notify } from "../../lib/notify";
import HelpTip from "../../components/HelpTip";

export interface GeoSearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface Props {
  mapRef: React.RefObject<L.Map>;
  fullscreen: boolean;
  mapMode: MapMode;
  activeTools: MapTool[];
  onExitFullscreen: () => void;

  cursorLatLng: { lat: number; lng: number } | null;
  onCursorMove: (lat: number, lng: number) => void;

  measurePoints: [number, number][];
  measuredDistanceKm: number;
  onMeasureAddPoint: (lat: number, lng: number) => void;
  onMeasureClear: () => void;
  onAddMeasurePointFromLocation: () => void;

  sketchLines: [number, number][][];
  activeSketch: [number, number][] | null;
  onSketchStart: (lat: number, lng: number) => void;
  onSketchExtend: (lat: number, lng: number) => void;
  onSketchEnd: () => void;
  onAddSketchPointFromLocation: () => void;
  onClearSketches: () => void;

  onRightClickAdd: (lat: number, lon: number) => void;
  onLeftClickDeselect: () => void;

  displayedPlaces: Place[];
  onSelectPlace: (id: number | null) => void;
  selectedPlace?: Place | null;
  onEditSelected?: (p: Place) => void;
  onDeleteSelected?: (id: number) => void;
  onTagClick?: (tag: string) => void;

  form: FormState;
  hasPreview: boolean;
  previewLat: number;
  previewLon: number;

  myLocation: [number, number] | null;
  radiusCircle: { center: [number, number]; radiusKm: number } | null;

  onUseMyLocationOnMap: () => void;
  onFitAll: () => void;
  onOpenAdd: (prefill?: { lat: number; lon: number; name?: string }) => void;
  activeListName?: string | null;
  onClearActiveList?: () => void;
  readOnly?: boolean;
  children?: React.ReactNode;
  selectedId: number | null;
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(2)} km`;
}

export default function MapCanvas({
  mapRef, fullscreen, mapMode, activeTools, onExitFullscreen,
  cursorLatLng, onCursorMove,
  measurePoints, measuredDistanceKm, onMeasureAddPoint, onMeasureClear, onAddMeasurePointFromLocation,
  sketchLines, activeSketch, onSketchStart, onSketchExtend, onSketchEnd, onAddSketchPointFromLocation, onClearSketches,
  onRightClickAdd, onLeftClickDeselect,
  displayedPlaces, onSelectPlace, selectedPlace, onEditSelected, onDeleteSelected, onTagClick,
  form, hasPreview, previewLat, previewLon,
  myLocation, radiusCircle,
  onUseMyLocationOnMap, onFitAll, onOpenAdd, activeListName, onClearActiveList,
  readOnly = false, children, selectedId,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GeoSearchResult[]>([]);
  const [searchPin, setSearchPin] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setCopiedCoords(false);
  }, [selectedPlace?.id]);

  async function runGeoSearch() {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`;
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("Search request failed");
      const data = (await res.json()) as GeoSearchResult[];
      setSearchResults(data);
      if (data.length === 0) notify.info("No matching locations found.");
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        notify.error("Location search failed", "Check your connection and try again.");
      }
    } finally {
      setSearching(false);
    }
  }

  function pickSearchResult(item: GeoSearchResult) {
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return;
    const shortName = item.display_name.split(",")[0].trim();
    setSearchPin({ lat, lon, label: shortName });
    setSearchResults([]);
    mapRef.current?.flyTo([lat, lon], 15, { duration: 0.7 });
  }

  async function copySelectedCoords(p: Place) {
    const text = `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCoords(true);
      notify.info("Coordinates copied", text);
      window.setTimeout(() => setCopiedCoords(false), 1800);
    } catch {
      notify.error("Couldn't copy coordinates");
    }
  }

  if (mapMode === "google") {
    const [lat, lon] = selectedPlace
      ? [selectedPlace.lat, selectedPlace.lon]
      : (myLocation ?? DEFAULT_CENTER);
    const zoom = selectedPlace || myLocation ? 14 : 6;
    const src = `https://www.google.com/maps?q=${lat},${lon}&z=${zoom}&output=embed`;

    return (
      <div className={`map-canvas-wrap${fullscreen ? " map-canvas-fullscreen" : ""}`}>
        <div className="map-floating-controls">
          <Tooltip title="My location" placement="left">
            <Button shape="circle" icon={<LocateFixed size={16} />} onClick={onUseMyLocationOnMap} />
          </Tooltip>
          {!readOnly && (
            <Tooltip title="Add place" placement="left">
              <Button shape="circle" icon={<Plus size={16} />} onClick={() => onOpenAdd()} />
            </Tooltip>
          )}
          {fullscreen && (
            <Tooltip title="Exit full screen" placement="left">
              <Button
                className="cursor-target"
                shape="circle"
                icon={<Minimize2 size={16} />}
                onClick={onExitFullscreen}
              />
            </Tooltip>
          )}
        </div>
        <iframe
          key={src}
          className="map-google-iframe"
          src={src}
          title="Google Maps"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    );
  }

  const showHudDock =
    (activeTools.includes("coordinates") && cursorLatLng) ||
    activeTools.includes("measure") ||
    activeTools.includes("draw");

  const selectedIcon = selectedPlace ? splitIcon(selectedPlace.icon) : null;
  const SelectedIconComp = selectedIcon ? iconForName(selectedIcon.name) : null;
  const selectedTags = selectedPlace?.tags
    ? selectedPlace.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  return (
    <div className={`map-canvas-wrap${fullscreen ? " map-canvas-fullscreen" : ""}`}>
      {/* Top-left floating geocoder search + active list banner */}
      <div className="map-top-left-overlay">
        <div className="map-geo-search-box">
          <Input
            size="middle"
            prefix={<Search size={14} color="var(--evol-muted)" />}
            placeholder="Jump to city, street, or landmark…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!e.target.value.trim()) setSearchResults([]);
            }}
            onPressEnter={runGeoSearch}
            allowClear
            suffix={
              <Button
                size="small"
                type="text"
                loading={searching}
                onClick={runGeoSearch}
                style={{ padding: "0 4px", color: "#22d3ee" }}
              >
                Go
              </Button>
            }
          />
          {searchResults.length > 0 && (
            <div className="map-geo-results">
              {searchResults.map((r) => (
                <button
                  key={r.place_id}
                  type="button"
                  className="map-geo-result-row"
                  onClick={() => pickSearchResult(r)}
                >
                  <span className="map-geo-result-title">{r.display_name.split(",")[0]}</span>
                  <span className="map-geo-result-sub">{r.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {activeListName && (
          <div className="map-active-list-banner">
            <span>List: <strong>{activeListName}</strong></span>
            {onClearActiveList && (
              <button type="button" onClick={onClearActiveList} title="Show all places">
                <X size={13} /> Show all
              </button>
            )}
          </div>
        )}

        {searchPin && !readOnly && (
          <div className="map-search-pin-bar">
            <span className="map-search-pin-name">{searchPin.label}</span>
            <Button
              size="small"
              type="primary"
              icon={<Plus size={12} />}
              onClick={() => {
                onOpenAdd({ lat: searchPin.lat, lon: searchPin.lon, name: searchPin.label });
                setSearchPin(null);
              }}
            >
              Save pin
            </Button>
            <button
              type="button"
              className="map-hud-action"
              onClick={() => setSearchPin(null)}
              title="Dismiss search pin"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Top-right floating controls */}
      <div className="map-floating-controls">
        <Tooltip title="Zoom in" placement="left">
          <Button shape="circle" icon={<ZoomIn size={16} />} onClick={() => mapRef.current?.zoomIn()} />
        </Tooltip>
        <Tooltip title="Zoom out" placement="left">
          <Button shape="circle" icon={<ZoomOut size={16} />} onClick={() => mapRef.current?.zoomOut()} />
        </Tooltip>
        <Tooltip title="My location" placement="left">
          <Button shape="circle" icon={<LocateFixed size={16} />} onClick={onUseMyLocationOnMap} />
        </Tooltip>
        {displayedPlaces.length > 0 && (
          <Tooltip title="Fit visible pins" placement="left">
            <Button shape="circle" icon={<Scan size={16} />} onClick={onFitAll} />
          </Tooltip>
        )}
        {!readOnly && (
          <Tooltip title="Add place" placement="left">
            <Button shape="circle" icon={<Plus size={16} />} onClick={() => onOpenAdd()} />
          </Tooltip>
        )}
        {fullscreen && (
          <Tooltip title="Exit full screen (Esc)" placement="left">
            <Button
              className="cursor-target"
              shape="circle"
              icon={<Minimize2 size={16} />}
              onClick={onExitFullscreen}
            />
          </Tooltip>
        )}
      </div>

      {/* Unified Bottom-Left HUD Dock (no stacked pills) */}
      {showHudDock && (
        <div className="map-hud-dock">
          {activeTools.includes("coordinates") && cursorLatLng && (
            <div className="map-hud-row map-hud-coords">
              <span>{cursorLatLng.lat.toFixed(5)}, {cursorLatLng.lng.toFixed(5)}</span>
            </div>
          )}

          {activeTools.includes("measure") && (
            <div className="map-hud-row">
              <Ruler size={13} color="#22d3ee" />
              {measurePoints.length < 2 ? (
                <>
                  <span>Measure</span>
                  <HelpTip placement="top" content="Click points on the map to measure distance, or double-click to clear." />
                </>
              ) : (
                <span>{formatDistance(measuredDistanceKm)}</span>
              )}
              <button type="button" className="map-hud-action" onClick={onAddMeasurePointFromLocation}>
                <LocateFixed size={12} /> +Me
              </button>
              {measurePoints.length > 0 && (
                <button type="button" className="map-hud-action" onClick={onMeasureClear}>
                  Clear
                </button>
              )}
            </div>
          )}

          {activeTools.includes("draw") && (
            <div className="map-hud-row">
              <PenLine size={13} color="#e879f9" />
              {activeSketch ? (
                <span>Drawing ({activeSketch.length} pts)</span>
              ) : (
                <>
                  <span>Draw</span>
                  <HelpTip placement="top" content="Click and drag on the map to sketch; panning is disabled while Draw is on." />
                </>
              )}
              <button type="button" className="map-hud-action magenta" onClick={onAddSketchPointFromLocation}>
                <LocateFixed size={12} /> +Me
              </button>
              {activeSketch && activeSketch.length > 1 && (
                <button type="button" className="map-hud-action magenta" onClick={onSketchEnd}>
                  Done
                </button>
              )}
              {sketchLines.length > 0 && (
                <button type="button" className="map-hud-action magenta" onClick={onClearSketches}>
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Selected Place Quick Inspector (bottom-right) */}
      {selectedPlace && selectedIcon && SelectedIconComp && (
        <div className="map-selected-inspector">
          <div className="map-inspector-head">
            <div className="map-place-swatch" style={{ ["--sw-color" as any]: selectedIcon.color }}>
              <SelectedIconComp size={15} color="#fff" />
            </div>
            <div className="map-inspector-titles">
              <strong>{selectedPlace.name}</strong>
              <span className="map-inspector-coords">
                {selectedPlace.lat.toFixed(5)}, {selectedPlace.lon.toFixed(5)}
              </span>
            </div>
            <button
              type="button"
              className="map-inspector-close"
              onClick={() => onSelectPlace(null)}
              title="Close details"
            >
              <X size={14} />
            </button>
          </div>

          {selectedPlace.description && (
            <p className="map-inspector-desc">{selectedPlace.description}</p>
          )}

          {selectedTags.length > 0 && (
            <div className="map-inspector-tags">
              {selectedTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="map-tag-chip"
                  onClick={() => onTagClick?.(t)}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}

          <div className="map-inspector-actions">
            <Tooltip title="Copy coordinates">
              <Button
                size="small"
                icon={copiedCoords ? <Check size={12} /> : <Copy size={12} />}
                onClick={() => copySelectedCoords(selectedPlace)}
              >
                {copiedCoords ? "Copied" : "Coords"}
              </Button>
            </Tooltip>
            <Button
              size="small"
              icon={<Navigation2 size={12} />}
              href={`https://www.google.com/maps/dir/?api=1&destination=${selectedPlace.lat},${selectedPlace.lon}`}
              target="_blank"
            >
              Directions
            </Button>
            {!readOnly && onEditSelected && (
              <Tooltip title="Edit">
                <Button size="small" icon={<Pencil size={12} />} onClick={() => onEditSelected(selectedPlace)} />
              </Tooltip>
            )}
            {!readOnly && onDeleteSelected && (
              <Tooltip title="Delete">
                <Button size="small" danger icon={<Trash2 size={12} />} onClick={() => onDeleteSelected(selectedPlace.id)} />
              </Tooltip>
            )}
          </div>
        </div>
      )}

      <MapContainer
        ref={mapRef}
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        minZoom={2}
        maxZoom={20}
        zoomControl={false}
        style={{ height: "100%" }}
      >
        {(() => {
          const tileConfig = MAP_TILE_CONFIG[mapMode];
          return (
            <>
              <TileLayer
                key={mapMode}
                url={tileConfig.url}
                attribution={tileConfig.attribution}
                subdomains={tileConfig.subdomains ?? "abc"}
                maxNativeZoom={tileConfig.maxNativeZoom ?? 19}
                maxZoom={20}
                className={tileConfig.className}
                updateWhenZooming={false}
                keepBuffer={4}
              />
              {tileConfig.overlayUrl && (
                <TileLayer
                  key={`${mapMode}-overlay`}
                  url={tileConfig.overlayUrl}
                  subdomains={tileConfig.subdomains ?? "abcd"}
                  maxNativeZoom={20}
                  maxZoom={20}
                  updateWhenZooming={false}
                  keepBuffer={4}
                />
              )}
            </>
          );
        })()}
        <MapEvents onRightClick={readOnly ? () => {} : onRightClickAdd} onLeftClick={onLeftClickDeselect} />
        <MapDragLock locked={activeTools.includes("draw")} />

        {activeTools.includes("coordinates") && (
          <CursorCoordinatesTool onMove={onCursorMove} />
        )}
        {activeTools.includes("measure") && (
          <MeasureTool onAddPoint={onMeasureAddPoint} onClear={onMeasureClear} />
        )}
        {activeTools.includes("draw") && (
          <SketchTool onStart={onSketchStart} onExtend={onSketchExtend} onEnd={onSketchEnd} />
        )}

        {measurePoints.length > 1 && (
          <Polyline positions={measurePoints} pathOptions={{ color: "#22d3ee", weight: 3, dashArray: "6 6" }} />
        )}
        {measurePoints.map((pt, i) => (
          <Circle
            key={`measure-pt-${i}`}
            center={pt}
            radius={20}
            pathOptions={{ color: "#22d3ee", fillColor: "#22d3ee", fillOpacity: 0.9 }}
          />
        ))}

        {sketchLines.map((line, i) => (
          <Polyline key={`sketch-${i}`} positions={line} pathOptions={{ color: "#e879f9", weight: 3 }} />
        ))}
        {activeSketch && <Polyline positions={activeSketch} pathOptions={{ color: "#e879f9", weight: 3 }} />}

        <MarkerClusterGroup chunkedLoading maxClusterRadius={50}>
          <PlaceMarkers places={displayedPlaces} selectedId={selectedId} onSelect={(id) => onSelectPlace(id)} />
        </MarkerClusterGroup>

        {hasPreview && (
          <Marker position={[previewLat, previewLon]} icon={glowDivIcon(form.iconName, form.color, 0.75)} />
        )}

        {searchPin && (
          <Marker
            position={[searchPin.lat, searchPin.lon]}
            icon={L.divIcon({
              html: '<div class="map-search-marker-pin"></div>',
              className: "",
              iconSize: [18, 18],
              iconAnchor: [9, 9],
            })}
          >
            <Popup>
              <div className="map-popup-body">
                <strong>{searchPin.label}</strong>
                <div className="map-popup-coords">{searchPin.lat.toFixed(5)}, {searchPin.lon.toFixed(5)}</div>
              </div>
            </Popup>
          </Marker>
        )}

        {myLocation && (
          <Marker
            position={myLocation}
            icon={L.divIcon({
              html: '<div style="width:16px;height:16px;border-radius:50%;background:#22d3ee;border:3px solid #fff;box-shadow:0 0 0 3px rgba(34,211,238,0.5);"></div>',
              className: "",
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            })}
          />
        )}

        {radiusCircle && (
          <Circle
            center={radiusCircle.center}
            radius={radiusCircle.radiusKm * 1000}
            pathOptions={{ color: "#8b6ff5", weight: 2, fillOpacity: 0.08 }}
          />
        )}
        {children}
      </MapContainer>
    </div>
  );
}

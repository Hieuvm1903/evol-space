import React from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline } from "react-leaflet";
import L from "leaflet";
import { Button, Tooltip } from "antd";
import { LocateFixed, Plus, Minimize2, Ruler, PenLine } from "lucide-react";
import type { Place } from "../../lib/placesService";
import { splitIcon } from "../../content/placeIcons";
import { glowDivIcon } from "./mapIcons";
import { MapEvents, MapDragLock, CursorCoordinatesTool, MeasureTool, SketchTool } from "./MapEventHandlers";
import { DEFAULT_CENTER, DEFAULT_ZOOM, MAP_TILE_CONFIG } from "./constants";
import type { MapMode, MapTool, FormState } from "./types";

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
  onSelectPlace: (id: number) => void;

  form: FormState;
  hasPreview: boolean;
  previewLat: number;
  previewLon: number;

  myLocation: [number, number] | null;
  radiusCircle: { center: [number, number]; radiusKm: number } | null;

  onUseMyLocationOnMap: () => void;
  onOpenAdd: () => void;
}

export default function MapCanvas({
  mapRef, fullscreen, mapMode, activeTools, onExitFullscreen,
  cursorLatLng, onCursorMove,
  measurePoints, measuredDistanceKm, onMeasureAddPoint, onMeasureClear, onAddMeasurePointFromLocation,
  sketchLines, activeSketch, onSketchStart, onSketchExtend, onSketchEnd, onAddSketchPointFromLocation, onClearSketches,
  onRightClickAdd, onLeftClickDeselect,
  displayedPlaces, onSelectPlace,
  form, hasPreview, previewLat, previewLon,
  myLocation, radiusCircle,
  onUseMyLocationOnMap, onOpenAdd,
}: Props) {
  return (
    <div className={`map-canvas-wrap${fullscreen ? " map-canvas-fullscreen" : ""}`}>
      <div className="map-floating-controls">
        <Tooltip title="My location" placement="left">
          <Button shape="circle" icon={<LocateFixed size={16} />} onClick={onUseMyLocationOnMap} />
        </Tooltip>
        <Tooltip title="Add place here" placement="left">
          <Button shape="circle" icon={<Plus size={16} />} onClick={onOpenAdd} />
        </Tooltip>
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

      {activeTools.includes("coordinates") && cursorLatLng && (
        <div className="map-coord-badge">
          {cursorLatLng.lat.toFixed(5)}, {cursorLatLng.lng.toFixed(5)}
        </div>
      )}

      {activeTools.includes("measure") && (
        <div className="map-measure-badge">
          <Ruler size={13} />
          {measurePoints.length < 2 ? "Tap the map, or add your location" : `${measuredDistanceKm.toFixed(2)} km`}
          <button className="map-measure-clear cursor-target" onClick={onAddMeasurePointFromLocation}>
            <LocateFixed size={12} /> My location
          </button>
          {measurePoints.length > 0 && (
            <button className="map-measure-clear" onClick={onMeasureClear}>Clear</button>
          )}
        </div>
      )}

      {activeTools.includes("draw") && (
        <div className="map-sketch-badge">
          <PenLine size={13} />
          {activeSketch ? `Drawing… ${activeSketch.length} pts` : "Drag on the map, or add points from location"}
          <button className="map-sketch-clear cursor-target" onClick={onAddSketchPointFromLocation}>
            <LocateFixed size={12} /> My location
          </button>
          {activeSketch && activeSketch.length > 1 && (
            <button className="map-sketch-clear cursor-target" onClick={onSketchEnd}>Finish</button>
          )}
          {sketchLines.length > 0 && (
            <button className="map-sketch-clear cursor-target" onClick={onClearSketches}>Clear</button>
          )}
        </div>
      )}

      <MapContainer ref={mapRef} center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} style={{ height: "100%" }}>
        <TileLayer
          url={MAP_TILE_CONFIG[mapMode].url}
          attribution={MAP_TILE_CONFIG[mapMode].attribution}
          className={MAP_TILE_CONFIG[mapMode].className}
        />        <MapEvents onRightClick={onRightClickAdd} onLeftClick={onLeftClickDeselect} />
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
          <Circle key={`measure-pt-${i}`} center={pt} radius={20} pathOptions={{ color: "#22d3ee", fillColor: "#22d3ee", fillOpacity: 0.9 }} />
        ))}

        {sketchLines.map((line, i) => (
          <Polyline key={`sketch-${i}`} positions={line} pathOptions={{ color: "#e879f9", weight: 3 }} />
        ))}
        {activeSketch && <Polyline positions={activeSketch} pathOptions={{ color: "#e879f9", weight: 3 }} />}

        {displayedPlaces.map((p) => {
          const { name: iconName, color } = splitIcon(p.icon);
          return (
            <Marker
              key={p.id}
              position={[p.lat, p.lon]}
              icon={glowDivIcon(iconName, color)}
              eventHandlers={{ click: () => onSelectPlace(p.id) }}
            >
              <Popup>
                <strong>{p.name}</strong>
                {p.description && <div>{p.description}</div>}
                <br />
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`} target="_blank" rel="noreferrer">
                  Directions ↗
                </a>
                {" · "}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Find ↗
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
        {radiusCircle && (
          <Circle
            center={radiusCircle.center}
            radius={radiusCircle.radiusKm * 1000}
            pathOptions={{ color: "#8b6ff5", weight: 2, fillOpacity: 0.08 }}
          />
        )}
      </MapContainer>
    </div >
  );
}

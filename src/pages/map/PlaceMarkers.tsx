// PlaceMarkers.tsx
import React from "react";
import { Marker, Popup } from "react-leaflet";
import type { Place } from "../../lib/placesService";
import { splitIcon } from "../../content/placeIcons";
import { glowDivIcon } from "./mapIcons";

interface Props {
  places: Place[];
  selectedId: number | null;
  onSelect: (id: number) => void; // must be a stable reference (setSelectedId is)
}

function PlaceMarkersImpl({ places, selectedId, onSelect }: Props) {
  return (
    <>
      {places.map((p) => {
        const { name, color } = splitIcon(p.icon);
        return (
          <Marker
            key={p.id}
            position={[p.lat, p.lon]}
            icon={glowDivIcon(name, color, 1, p.id === selectedId)}
            eventHandlers={{ click: () => onSelect(p.id) }}
          >
            <Popup> <strong>{p.name}</strong>
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
              </a></Popup>
          </Marker>
        );
      })}
    </>
  );
}
export default React.memo(PlaceMarkersImpl);
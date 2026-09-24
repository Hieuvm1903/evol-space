import { useMemo, useState } from "react";
import type { Place } from "../../lib/placesService";
import * as placesService from "../../lib/placesService";
import { splitIcon } from "../../content/placeIcons";
import type { SortOption } from "./types";

export function usePlaceFilters(places: Place[]) {
  const [nameFilter, setNameFilter] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [iconFilter, setIconFilter] = useState<string[]>([]);
  const [distCenter, setDistCenter] = useState("");
  const [radiusKm, setRadiusKm] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const allTags = useMemo(() => placesService.getAllTags(places), [places]);

  const { result, radiusCircle } = useMemo(() => {
    let list = places;
    if (nameFilter.trim()) {
      const q = nameFilter.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (iconFilter.length) list = list.filter((p) => iconFilter.includes(splitIcon(p.icon).name));
    if (tagFilter.length) {
      list = list.filter((p) => {
        const pt = (p.tags ?? "").split(",").map((t) => t.trim());
        return tagFilter.some((t) => pt.includes(t));
      });
    }

    let circle: { center: [number, number]; radiusKm: number } | null = null;
    let origin: [number, number] | null = null;
    if (distCenter.trim()) {
      const parts = distCenter.split(",").map((s) => parseFloat(s.trim()));
      if (parts.length === 2 && !parts.some(Number.isNaN)) {
        origin = [parts[0], parts[1]];
        if (radiusKm > 0) {
          circle = { center: origin, radiusKm };
          list = list.filter((p) => placesService.haversineKm(origin![0], origin![1], p.lat, p.lon) <= radiusKm);
        }
      }
    }

    const sorted = [...list];
    const byName = (a: Place, b: Place) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    switch (sortBy) {
      case "newest": sorted.sort((a, b) => b.id - a.id); break;
      case "oldest": sorted.sort((a, b) => a.id - b.id); break;
      case "name-asc": sorted.sort(byName); break;
      case "name-desc": sorted.sort((a, b) => byName(b, a)); break;
      case "distance":
        if (origin) {
          sorted.sort((a, b) =>
            placesService.haversineKm(origin![0], origin![1], a.lat, a.lon) -
            placesService.haversineKm(origin![0], origin![1], b.lat, b.lon));
        }
        break;
    }
    return { result: sorted, radiusCircle: circle };
  }, [places, nameFilter, iconFilter, tagFilter, distCenter, radiusKm, sortBy]);

  function fillDistanceFromMyLocation() {
    if (!navigator.geolocation) { alert("Geolocation not available in this browser."); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setDistCenter(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`),
      (err) => alert(`Couldn't get your location: ${err.message}`),
    );
  }

  return {
    nameFilter, setNameFilter, tagFilter, setTagFilter, iconFilter, setIconFilter,
    distCenter, setDistCenter, radiusKm, setRadiusKm, sortBy, setSortBy,
    allTags, result, radiusCircle, fillDistanceFromMyLocation,
  };
}
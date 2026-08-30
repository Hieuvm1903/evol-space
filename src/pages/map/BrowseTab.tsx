import React from "react";
import { Button, Input, Select, Tag, Empty, Tooltip, InputNumber, Typography } from "antd";
import { Search, LocateFixed, Pencil, Trash2, Navigation2, ArrowDownAZ } from "lucide-react";
import { PLACE_ICON_CHOICES, iconForName, splitIcon } from "../../content/placeIcons";
import type { Place } from "../../lib/placesService";
import type { SortOption } from "./types";

const { Text } = Typography;

interface Props {
  loading: boolean;
  places: Place[];
  nameFilter: string;
  onNameFilterChange: (v: string) => void;
  iconFilter: string[];
  onIconFilterChange: (v: string[]) => void;
  sortBy: SortOption;
  onSortByChange: (v: SortOption) => void;
  distCenter: string;
  onDistCenterChange: (v: string) => void;
  onUseMyLocationForDistance: () => void;
  radiusKm: number;
  onRadiusKmChange: (v: number) => void;
  allTags: string[];
  tagFilter: string[];
  onTagFilterChange: (v: string[]) => void;
  selectedId: number | null;
  onSelectAndFly: (p: Place) => void;
  onEdit: (p: Place) => void;
  onDelete: (id: number) => void;
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name-asc", label: "Name (A–Z)" },
  { value: "name-desc", label: "Name (Z–A)" },
  { value: "distance", label: "Nearest" },
];

export default function BrowseTab({
  loading, places, nameFilter, onNameFilterChange, iconFilter, onIconFilterChange,
  sortBy, onSortByChange,
  distCenter, onDistCenterChange, onUseMyLocationForDistance, radiusKm, onRadiusKmChange,
  allTags, tagFilter, onTagFilterChange, selectedId, onSelectAndFly, onEdit, onDelete,
}: Props) {
  return (
    <div className="map-browse-panel">
      <div className="map-sidebar-fixed">
        <div className="map-search-row">
          <Input
            prefix={<Search size={14} color="#9c97b8" />}
            value={nameFilter}
            onChange={(e) => onNameFilterChange(e.target.value)}
            placeholder="Search places…"
            allowClear
          />
        </div>

        {/* Icon filter + sort share a row */}
        <div className="map-filter-row">
          <Select
            mode="multiple"
            allowClear
            style={{ flex: 1, minWidth: 0 }}
            placeholder="Filter by icon"
            value={iconFilter}
            onChange={onIconFilterChange}
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
          <Select
            style={{ width: 132, flexShrink: 0 }}
            value={sortBy}
            onChange={onSortByChange}
            suffixIcon={<ArrowDownAZ size={13} />}
            options={SORT_OPTIONS}
          />
        </div>

        <div className="map-filter-row map-distance-row">
          <Input
            size="small"
            value={distCenter}
            onChange={(e) => onDistCenterChange(e.target.value)}
            placeholder="lat, lon"
            allowClear
          />
          <Tooltip title="Use my current location">
            <Button size="small" icon={<LocateFixed size={13} />} onClick={onUseMyLocationForDistance} />
          </Tooltip>
          <InputNumber
            size="small"
            min={0}
            value={radiusKm}
            onChange={(v) => onRadiusKmChange(v ?? 0)}
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
                  onTagFilterChange(checked ? [...tagFilter, t] : tagFilter.filter((x) => x !== t))
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
        ) : places.length === 0 ? (
          <Empty description={<span style={{ color: "#9c97b8" }}>No places match.</span>} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          places.map((p) => {
            const { name: iconName, color } = splitIcon(p.icon);
            const Icon = iconForName(iconName);
            const isSelected = selectedId === p.id;
            return (
              <div
                key={p.id}
                className={`map-place-row cursor-target${isSelected ? " active" : ""}`}
                onClick={() => onSelectAndFly(p)}
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
                      <Button size="small" icon={<Pencil size={13} />} onClick={() => onEdit(p)} />
                    </Tooltip>
                    <Tooltip title="Delete">
                      <Button size="small" danger icon={<Trash2 size={13} />} onClick={() => onDelete(p.id)} />
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
  );
}
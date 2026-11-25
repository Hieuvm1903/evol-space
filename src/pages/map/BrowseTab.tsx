import React from "react";
import { Button, Input, Select, Empty, Tooltip, InputNumber, Skeleton } from "antd";
import {
  Search, LocateFixed, Pencil, Trash2, Navigation2, ArrowDownAZ, MapPinned,
  RotateCcw, CheckSquare, Scan,
} from "lucide-react";
import { PLACE_ICON_CHOICES, iconForName, splitIcon } from "../../content/placeIcons";
import type { Place } from "../../lib/placesService";
import type { SortOption } from "./types";
import type { LongPressSelect } from "../../hooks/useLongPressSelect";
import LongPressRing from "../../components/LongPressRing";
import SelectCheckbox from "../../components/SelectCheckbox";
import HelpTip from "../../components/HelpTip";

interface Props {
  loading: boolean;
  totalCount: number;
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
  onClearFilters: () => void;
  onFitAll: () => void;
  selectedId: number | null;
  onSelectAndFly: (p: Place) => void;
  onEdit?: (p: Place) => void;
  onDelete?: (id: number) => void;
  longPress: LongPressSelect<number>;
  readOnly?: boolean;
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name-asc", label: "Name (A–Z)" },
  { value: "name-desc", label: "Name (Z–A)" },
  { value: "distance", label: "Nearest" },
];

export default function BrowseTab({
  loading, totalCount, places, nameFilter, onNameFilterChange, iconFilter, onIconFilterChange,
  sortBy, onSortByChange,
  distCenter, onDistCenterChange, onUseMyLocationForDistance, radiusKm, onRadiusKmChange,
  allTags, tagFilter, onTagFilterChange, onClearFilters, onFitAll,
  selectedId, onSelectAndFly, onEdit, onDelete, longPress, readOnly = false,
}: Props) {
  const hasFilters = Boolean(
    nameFilter.trim() || iconFilter.length || tagFilter.length || distCenter.trim() || radiusKm > 0,
  );

  return (
    <div className="map-browse-panel">
      <div className="map-sidebar-fixed">
        <div className="map-search-row">
          <Input
            prefix={<Search size={14} color="#9c97b8" />}
            value={nameFilter}
            onChange={(e) => onNameFilterChange(e.target.value)}
            placeholder="Filter saved places…"
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
            placeholder="Origin: lat, lon"
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
            suffix="km"
            className="map-distance-radius"
          />
        </div>

        {allTags.length > 0 && (
          <div className="map-tag-cloud">
            {allTags.map((t) => {
              const active = tagFilter.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  className={`map-tag-chip${active ? " active" : ""}`}
                  onClick={() =>
                    onTagFilterChange(active ? tagFilter.filter((x) => x !== t) : [...tagFilter, t])
                  }
                >
                  #{t}
                </button>
              );
            })}
          </div>
        )}

        <div className="map-browse-meta-bar">
          <span className="map-browse-count">
            {hasFilters ? `${places.length} / ${totalCount} places` : `${totalCount} place${totalCount === 1 ? "" : "s"}`}
          </span>
          <div className="map-browse-meta-actions">
            {hasFilters && (
              <Tooltip title="Clear filters">
                <Button size="small" type="text" icon={<RotateCcw size={12} />} onClick={onClearFilters}>
                  Reset
                </Button>
              </Tooltip>
            )}
            {places.length > 0 && (
              <Tooltip title="Fit visible pins on map">
                <Button size="small" type="text" icon={<Scan size={13} />} onClick={onFitAll} />
              </Tooltip>
            )}
            {!readOnly && places.length > 0 && (
              <Tooltip title={longPress.selectMode ? "Exit multi-select" : "Select multiple"}>
                <Button
                  size="small"
                  type={longPress.selectMode ? "primary" : "text"}
                  icon={<CheckSquare size={13} />}
                  onClick={() =>
                    longPress.selectMode ? longPress.exitSelectMode() : longPress.enterSelectMode()
                  }
                />
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      <div className="map-place-list">
        {loading ? (
          <div className="map-skeleton-stack">
            <Skeleton active paragraph={{ rows: 1 }} title={{ width: "60%" }} />
            <Skeleton active paragraph={{ rows: 1 }} title={{ width: "45%" }} />
            <Skeleton active paragraph={{ rows: 1 }} title={{ width: "70%" }} />
          </div>
        ) : places.length === 0 ? (
          <Empty
            description={
              <span style={{ color: "#9c97b8", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {hasFilters ? "No places match your filters." : (
                  <>
                    <span>No places saved yet.</span>
                    <HelpTip content="Right-click the map to add a place." />
                  </>
                )}
              </span>
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            {hasFilters && (
              <Button size="small" onClick={onClearFilters}>Clear filters</Button>
            )}
          </Empty>
        ) : (
          places.map((p) => {
            const { name: iconName, color } = splitIcon(p.icon);
            const Icon = iconForName(iconName);
            const isFlySelected = selectedId === p.id;
            const selecting = !readOnly && longPress.selectMode;
            const bulkChecked = !readOnly && longPress.isSelected(p.id);
            const pressing = !readOnly && longPress.isPressing(p.id);
            const lp = readOnly ? null : longPress.bind(p.id);
            return (
              <div
                key={p.id}
                className={`map-place-row cursor-target${isFlySelected ? " active" : ""}${bulkChecked ? " bulk-selected" : ""}${pressing ? " pressing" : ""}`}
                {...(lp ?? {})}
                onClick={(e) => {
                  lp?.onClick(e);
                  if (!selecting && !e.defaultPrevented) onSelectAndFly(p);
                }}
              >
                {selecting ? (
                  <SelectCheckbox checked={bulkChecked} />
                ) : pressing ? (
                  <LongPressRing />
                ) : null}

                <div className="map-place-swatch" style={{ ["--sw-color" as any]: color }}>
                  <Icon size={15} color="#fff" />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="map-place-name">{p.name}</div>
                  {p.description && <div className="map-place-desc">{p.description}</div>}
                </div>
                {isFlySelected && !selecting && (
                  <div className="map-place-row-actions" onClick={(e) => e.stopPropagation()}>
                    {!readOnly && onEdit && (
                      <Tooltip title="Edit">
                        <Button size="small" icon={<Pencil size={13} />} onClick={() => onEdit(p)} />
                      </Tooltip>
                    )}
                    <Tooltip title="Directions">
                      <Button
                        size="small"
                        icon={<Navigation2 size={13} />}
                        href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`}
                        target="_blank"
                      />
                    </Tooltip>
                    <Tooltip title="Find on Google Maps">
                      <Button
                        size="small"
                        icon={<MapPinned size={13} />}
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}+${p.lat},${p.lon}`}
                        target="_blank"
                      />
                    </Tooltip>
                    {!readOnly && onDelete && (
                      <Tooltip title="Delete">
                        <Button size="small" danger icon={<Trash2 size={13} />} onClick={() => onDelete(p.id)} />
                      </Tooltip>
                    )}
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
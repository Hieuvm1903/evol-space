import React from "react";
import { Button, Input, ColorPicker, Popover, Tooltip, Space, AutoComplete } from "antd";
import { Crosshair } from "lucide-react";
import { PLACE_ICON_CHOICES, iconForName, labelForName } from "../../content/placeIcons";
import { tagSuggestions, applyTagSuggestion, splitLatLonPair } from "./formHelpers";
import type { FormState } from "./types";
import "./MapPage.css";
interface Props {
  form: FormState;
  onFormChange: (form: FormState) => void;
  allTags: string[];
  onUseMyLocation: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function PlaceFormTab({ form, onFormChange, allTags, onUseMyLocation, onSave, onCancel }: Props) {
  return (
    <div className="map-sidebar-body" style={{ paddingTop: 14 }}>
      <div className="map-form-row">
        <span className="map-form-row-label">Name</span>
        <div className="map-form-row-content">
          <Input
            value={form.name}
            onChange={(e) => onFormChange({ ...form, name: e.target.value })}
            placeholder="e.g. Hồ Gươm"
          />
        </div>
      </div>

      <div className="map-form-row">
        <span className="map-form-row-label">Icon / Color</span>
        <div className="map-form-row-content" style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Popover
              trigger="click"
              placement="bottomLeft"
              content={
                <div className="map-icon-grid" style={{ width: 216, margin: 0 }}>
                  {PLACE_ICON_CHOICES.map((c) => {
                    const Icon = c.icon;
                    return (
                      <Tooltip key={c.name} title={c.label}>
                        <button
                          type="button"
                          className={`map-icon-btn${form.iconName === c.name ? " active" : ""}`}
                          onClick={() => onFormChange({ ...form, iconName: c.name })}
                        >
                          <Icon size={16} />
                        </button>
                      </Tooltip>
                    );
                  })}
                </div>
              }
            >
              <Button className="map-icon-trigger cursor-target" style={{ width: "100%" }}>
                {(() => {
                  const SelectedIcon = iconForName(form.iconName);
                  return <SelectedIcon size={16} color={form.color} />;
                })()}
                <span>{labelForName(form.iconName)}</span>
              </Button>
            </Popover>
          </div>

          <ColorPicker
            value={form.color}
            onChange={(c) => onFormChange({ ...form, color: c.toHexString() })}
            presets={[{ label: "Galaxy", colors: ["#8b6ff5", "#22d3ee", "#e879f9", "#f472b6", "#60a5fa", "#34d399"] }]}
          />
        </div>
      </div>

      <div className="map-form-row">
        <span className="map-form-row-label">Lat / Lon</span>
        <div className="map-form-row-content">
          <Space.Compact style={{ width: "100%" }}>
            <Input
              value={form.lat}
              onChange={(e) => {
                const pair = splitLatLonPair(e.target.value);
                onFormChange(pair ? { ...form, lat: pair.lat, lon: pair.lon } : { ...form, lat: e.target.value });
              }}
              allowClear
            />
            <Input
              value={form.lon}
              onChange={(e) => {
                const pair = splitLatLonPair(e.target.value);
                onFormChange(pair ? { ...form, lat: pair.lat, lon: pair.lon } : { ...form, lon: e.target.value });
              }}
              allowClear
            />
            <Tooltip title="Use my current location">
              <Button icon={<Crosshair size={15} />} onClick={onUseMyLocation} />
            </Tooltip>
          </Space.Compact>
        </div>
      </div>

      <div className="map-form-row">
        <span className="map-form-row-label">Tags</span>
        <div className="map-form-row-content">
          <AutoComplete
            style={{ width: "100%" }}
            value={form.tags}
            options={tagSuggestions(form.tags, allTags).map((t) => ({ value: t, label: `#${t}` }))}
            onChange={(v) => onFormChange({ ...form, tags: v })}
            onSelect={(v) => onFormChange({ ...form, tags: applyTagSuggestion(form.tags, v as string) })}
            placeholder="date, food, memory..."
          >
            <Input />
          </AutoComplete>
          {allTags.length > 0 && (
            <div style={{ fontSize: 11.5, color: "#7d78a0", marginTop: 6 }}>
              Existing: {allTags.map((t) => `#${t}`).join(", ")}
            </div>
          )}
        </div>
      </div>

      <div className="map-form-row">
        <span className="map-form-row-label">Description</span>
        <div className="map-form-row-content">
          <Input.TextArea
            value={form.description}
            onChange={(e) => onFormChange({ ...form, description: e.target.value })}
            placeholder="Why this place matters..."
            rows={3}
          />
        </div>
      </div>

      <div className="map-form-actions">
        <Button type="primary" block onClick={onSave}>Save</Button>
        <Button block onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
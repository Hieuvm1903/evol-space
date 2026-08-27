import React from "react";
import { Button, Input, ColorPicker, Popover, Tooltip, Space, AutoComplete, Typography } from "antd";
import { Crosshair } from "lucide-react";
import { PLACE_ICON_CHOICES, iconForName, labelForName } from "../../content/placeIcons";
import { tagSuggestions, applyTagSuggestion } from "./formHelpers";
import type { FormState } from "./types";

const { Text } = Typography;

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
      <Text style={{ fontSize: 12, color: "#9c97b8" }}>Place name</Text>
      <Input
        style={{ marginTop: 6, marginBottom: 12 }}
        value={form.name}
        onChange={(e) => onFormChange({ ...form, name: e.target.value })}
        placeholder="e.g. Hồ Gươm"
      />

      <div style={{ display: "flex", gap: 10, margin: "6px 0 12px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 12, color: "#9c97b8" }}>Icon</Text>
          <div style={{ marginTop: 6 }}>
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
        </div>

        <div>
          <Text style={{ fontSize: 12, color: "#9c97b8" }}>Color</Text>
          <div style={{ marginTop: 6 }}>
            <ColorPicker
              value={form.color}
              onChange={(c) => onFormChange({ ...form, color: c.toHexString() })}
              presets={[{ label: "Galaxy", colors: ["#8b6ff5", "#22d3ee", "#e879f9", "#f472b6", "#60a5fa", "#34d399"] }]}
            />
          </div>
        </div>
      </div>

      <Space.Compact style={{ width: "100%", marginBottom: 12 }}>
        <Input addonBefore="Lat" value={form.lat} onChange={(e) => onFormChange({ ...form, lat: e.target.value })} />
        <Input addonBefore="Lon" value={form.lon} onChange={(e) => onFormChange({ ...form, lon: e.target.value })} />
        <Tooltip title="Use my current location">
          <Button icon={<Crosshair size={15} />} onClick={onUseMyLocation} />
        </Tooltip>
      </Space.Compact>

      <Text style={{ fontSize: 12, color: "#9c97b8" }}>Tags</Text>
      <AutoComplete
        style={{ width: "100%", marginTop: 6, marginBottom: 4 }}
        value={form.tags}
        options={tagSuggestions(form.tags, allTags).map((t) => ({ value: t, label: `#${t}` }))}
        onChange={(v) => onFormChange({ ...form, tags: v })}
        onSelect={(v) => onFormChange({ ...form, tags: applyTagSuggestion(form.tags, v as string) })}
        placeholder="date, food, memory..."
      >
        <Input />
      </AutoComplete>
      {allTags.length > 0 && (
        <div style={{ fontSize: 11.5, color: "#7d78a0", marginBottom: 12 }}>
          Existing: {allTags.map((t) => `#${t}`).join(", ")}
        </div>
      )}

      <Text style={{ fontSize: 12, color: "#9c97b8" }}>Description</Text>
      <Input.TextArea
        style={{ marginTop: 6 }}
        value={form.description}
        onChange={(e) => onFormChange({ ...form, description: e.target.value })}
        placeholder="Why this place matters..."
        rows={3}
      />

      <div className="map-form-actions">
        <Button type="primary" block onClick={onSave}>Save</Button>
        <Button block onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

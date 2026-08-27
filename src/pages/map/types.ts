export type MapMode = "light" | "dark" | "street" | "satellite" | "terrain";
export type MapTool = "fullscreen" | "measure" | "coordinates" | "draw";

export interface FormState {
  editId: number | null;
  name: string;
  lat: string;
  lon: string;
  description: string;
  iconName: string;
  color: string;
  tags: string;
}

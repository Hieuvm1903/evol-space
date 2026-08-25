import {
  MapPin, Home, Star, Heart, Coffee, TreePine, UtensilsCrossed, BedDouble,
  GraduationCap, Gift, Flag, Music2, PartyPopper, ShoppingBag, Film, Camera,
  Landmark, Car, Waves, Ticket, type LucideIcon,
} from "lucide-react";

export const PLACE_ICON_CHOICES: { icon: LucideIcon; name: string; label: string }[] = [
  { icon: MapPin, name: "map-marker", label: "Marker" },
  { icon: Home, name: "home", label: "Home" },
  { icon: Star, name: "star", label: "Star" },
  { icon: Heart, name: "heart", label: "Heart" },
  { icon: Coffee, name: "coffee", label: "Coffee" },
  { icon: TreePine, name: "tree", label: "Nature" },
  { icon: UtensilsCrossed, name: "cutlery", label: "Food" },
  { icon: BedDouble, name: "bed", label: "Stay" },
  { icon: GraduationCap, name: "graduation-cap", label: "School" },
  { icon: Gift, name: "gift", label: "Gift" },
  { icon: Flag, name: "flag", label: "Flag" },
  { icon: Music2, name: "music", label: "Music" },
  { icon: PartyPopper, name: "glass", label: "Party" },
  { icon: ShoppingBag, name: "shopping-cart", label: "Shopping" },
  { icon: Film, name: "film", label: "Cinema" },
  { icon: Camera, name: "camera-retro", label: "Photo" },
  { icon: Landmark, name: "university", label: "Landmark" },
  { icon: Car, name: "car", label: "Transport" },
  { icon: Waves, name: "tint", label: "Water" },
  { icon: Ticket, name: "ticket", label: "Event" },
];

export const DEFAULT_ICON_NAME = "map-marker";
export const DEFAULT_COLOR = "#8b6ff5"; // galaxy violet

export function iconForName(name: string): LucideIcon {
  return PLACE_ICON_CHOICES.find((c) => c.name === name)?.icon ?? MapPin;
}
export function labelForName(name: string): string {
  return PLACE_ICON_CHOICES.find((c) => c.name === name)?.label ?? "Marker";
}

export function splitIcon(iconValue: string | null | undefined): { name: string; color: string } {
  if (iconValue && iconValue.includes("|")) {
    const [name, color] = iconValue.split("|");
    const validColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_COLOR;
    return { name, color: validColor };
  }
  return { name: DEFAULT_ICON_NAME, color: DEFAULT_COLOR };
}
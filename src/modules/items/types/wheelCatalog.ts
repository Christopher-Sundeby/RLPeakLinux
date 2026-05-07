import type { RemoteCatalogFileReference } from "../remoteApiService";

export type WheelItemType = "Wheel" | "Wheels";

export interface WheelCatalog {
  schema?: string;
  total_wheels?: number;
  base_files?: string[];
  base_thumbnail?: string;
  base_thumbnail_path?: string;
  remote_thumbnail?: RemoteCatalogFileReference;
  wheels: WheelCatalogItem[];
}

export interface WheelCatalogItem {
  wheel_folder: string;
  ingame_wheel_name: string;
  item_type?: WheelItemType;
  output_upk_file: string;
  wheel_originale?: string;
  remote_files?: RemoteCatalogFileReference[];
}

import type { RemoteCatalogFileReference } from "../remoteApiService";

export interface SkinCatalog {
  schema?: string;
  total_cars?: number;
  total_skins?: number;
  total_universal_source_skins?: number;
  cars: Record<string, SkinCarCatalogEntry>;
}

export interface SkinCarCatalogEntry {
  car: string;
  skin_count: number;
  base_files: string[];
  skins: SkinCatalogItem[];
  universal_source_skin_count?: number;
  base_thumbnail?: string;
  base_thumbnail_path?: string;
  remote_thumbnail?: RemoteCatalogFileReference;
}

export interface SkinCatalogItem {
  car_folder: string;
  skin_folder: string;
  ingame_decal_name: string;
  item_type: string;
  output_upk_file: string;
  ingame_body?: string;
  skin_originale?: string;
  source_scope?: string;
  is_universal_source?: boolean;
  is_universal_ingame?: boolean;
  remote_files?: RemoteCatalogFileReference[];
}

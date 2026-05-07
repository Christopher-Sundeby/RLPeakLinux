import type { RemoteCatalogFileReference } from "../remoteApiService";

export interface BoostCatalog {
  schema?: string;
  total_boosts?: number;
  base_files?: string[];
  base_thumbnail?: string;
  base_thumbnail_path?: string;
  remote_thumbnail?: RemoteCatalogFileReference;
  boosts: BoostCatalogItem[];
}

export interface BoostCatalogItem {
  boost_folder: string;
  ingame_boost_name: string;
  output_files: string[];
  item_type?: "Boost";
  boost_originale?: string;
  product_path?: string;
  has_thumbnail?: boolean;
  output_visual_upk_file?: string;
  output_audio_bnk_file?: string;
  remote_files?: RemoteCatalogFileReference[];
}

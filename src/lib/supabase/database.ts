// Types des tables Supabase utilisées par l'application (voir supabase/migrations/).
// Écrits à la main : à tenir à jour avec les migrations.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Ligne renvoyée par les fonctions d'écriture des cartes (supabase/migrations/20261008120000_maps_write_functions.sql). */
export type MapWriteResult = { id: string; name: string; updated_at: string; revision: number };

export type Database = {
  public: {
    Tables: {
      maps: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          data: Json;
          /** Nombre d'éléments de la carte, tenu par un déclencheur (jamais écrit par l'application). */
          stats: Json | null;
          /** Taille de `data` en octets, tenue par un déclencheur (quota par compte ; jamais écrite par l'application). */
          data_bytes: number;
          /** Version du contenu, incrémentée par un déclencheur (jamais écrite par l'application). */
          revision: number;
          /**
           * Logo ou aperçu de la carte (20261014120100_maps_cover.sql), écrit par set_map_cover ;
           * à valider par parseMapCover avant usage.
           */
          cover: Json | null;
          created_at: string;
          updated_at: string;
        };
        /**
         * Aucune création directe : les cartes sont créées par la fonction create_map
         * (20261008120100_maps_revoke_direct_writes.sql retire le droit INSERT).
         */
        Insert: { [_ in never]: never };
        /** Seul le nom s'écrit directement ; le contenu passe par update_map_data. */
        Update: { name?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      /** Crée une carte de l'utilisateur connecté ; `p_data` : la carte en JSON compact (4 Mo au plus). */
      create_map: { Args: { p_name: string; p_data: string }; Returns: MapWriteResult[] };
      /** Remplace le contenu si la carte est à la version attendue ; aucune ligne si elle n'existe pas. */
      update_map_data: {
        Args: { p_id: string; p_data: string; p_expected_revision: number };
        Returns: MapWriteResult[];
      };
      /**
       * Remplace (ou retire, `p_cover` null) le logo ou l'aperçu d'une carte de l'utilisateur
       * connecté ; `p_cover` : le logo en JSON compact (16 000 octets au plus). false si la carte
       * n'existe pas (20261014120100_maps_cover.sql).
       */
      set_map_cover: { Args: { p_id: string; p_cover: string | null }; Returns: boolean };
      /**
       * Supprime le compte de l'utilisateur connecté (auth.uid()) et, en cascade, ses cartes et ses
       * sessions ; false s'il n'existait déjà plus (20261009120000_delete_my_account.sql).
       */
      delete_my_account: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

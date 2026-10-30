// Types des tables Supabase utilisées par l'application (voir supabase/migrations/).
// Écrits à la main : à tenir à jour avec les migrations.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Ligne renvoyée par les fonctions d'écriture des cartes (supabase/migrations/20261008120000_maps_write_functions.sql). */
export type MapWriteResult = { id: string; name: string; updated_at: string; revision: number };

/** Paramètres de create_my_profile et update_my_profile. */
type ProfileWriteArgs = { p_handle: string; p_display_name: string; p_bio: string; p_visibility: string };

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
      /**
       * Profils (20261017120100_profiles.sql) : chaque compte ne lit et ne supprime directement que sa
       * ligne ; écritures par create_my_profile, update_my_profile et set_profile_avatar ; les profils
       * des autres se lisent par profile_by_handle.
       */
      profiles: {
        Row: {
          user_id: string;
          handle: string;
          display_name: string;
          bio: string;
          /** Avatar actuel (fichier « avatars/<avatar_id> » du compte), écrit par set_profile_avatar. */
          avatar_id: string | null;
          visibility: "members" | "contacts";
          handle_changed_at: string;
          created_at: string;
          updated_at: string;
        };
        /** Aucune écriture directe (droits retirés) : voir les fonctions ci-dessous. */
        Insert: Record<string, never>;
        Update: Record<string, never>;
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
      /**
       * Profil désigné par son identifiant exact, s'il est visible pour le compte connecté ; aucune
       * ligne sinon (20261017120100_profiles.sql).
       */
      profile_by_handle: {
        Args: { p_handle: string };
        Returns: { handle: string; display_name: string; bio: string; avatar_id: string | null; is_self: boolean }[];
      };
      /** Compteurs anti-abus du compte connecté (20261017120000_rate_limits.sql). */
      my_rate_limits: {
        Args: Record<string, never>;
        Returns: { action: string; window_start: string; hits: number }[];
      };
      /** Crée le profil du compte connecté ; « created » ou « handle-taken » (20261017120100_profiles.sql). */
      create_my_profile: { Args: ProfileWriteArgs; Returns: string };
      /** Modifie le profil du compte connecté ; « saved », « handle-taken » ou « rate-limited » (20261017120100_profiles.sql). */
      update_my_profile: { Args: ProfileWriteArgs; Returns: string };
      /** Désigne (ou retire) l'avatar du profil du compte connecté ; renvoie l'avatar précédent (20261017120200_avatars.sql). */
      set_profile_avatar: { Args: { p_avatar: string | null }; Returns: string | null };
      /** Ouvre pour une minute la lecture de l'avatar désigné s'il est visible pour le compte connecté. */
      open_avatar_read: { Args: { p_avatar: string }; Returns: boolean };
      /** Jeton d'envoi d'avatar de cinq minutes ; renvoie le nom du fichier à envoyer (20261017120200_avatars.sql). */
      open_avatar_upload: { Args: Record<string, never>; Returns: string };
      /** Annule le jeton d'envoi d'avatar du compte connecté. */
      cancel_avatar_upload: { Args: Record<string, never>; Returns: undefined };
      /** Jeton d'envoi d'avatar du compte connecté (droit d'accès ; une ligne au plus). */
      my_avatar_upload_ticket: {
        Args: Record<string, never>;
        Returns: { avatar_id: string; expires_at: string }[];
      };
      /** Noms des fichiers du compte connecté dans le compartiment « avatars ». */
      my_avatar_files: { Args: Record<string, never>; Returns: string[] };
      /** Autorisations d'affichage d'avatars du compte connecté (20261017120200_avatars.sql). */
      my_avatar_read_grants: {
        Args: Record<string, never>;
        Returns: { avatar_id: string; expires_at: string }[];
      };
      /**
       * Contacts (20261018120000_contacts.sql) : chaque fonction renvoie un statut texte (voir
       * src/lib/supabase/contacts.ts) ; les références (`p_request`, `p_contact`, `p_block`) sont les
       * `id` renvoyés par les listes ci-dessous.
       */
      send_contact_request: { Args: { p_handle: string }; Returns: string };
      accept_contact_request: { Args: { p_request: string }; Returns: string };
      refuse_contact_request: { Args: { p_request: string }; Returns: string };
      cancel_contact_request: { Args: { p_request: string }; Returns: string };
      remove_contact: { Args: { p_contact: string }; Returns: string };
      /** `p_kind` : « handle » (identifiant exact), « request » ou « contact » (référence). */
      block_member: { Args: { p_kind: string; p_value: string }; Returns: string };
      unblock_member: { Args: { p_block: string }; Returns: string };
      /** Contacts du compte connecté (jamais d'identifiant de compte). */
      my_contacts: {
        Args: Record<string, never>;
        Returns: { id: string; handle: string; display_name: string; avatar_id: string | null; created_at: string }[];
      };
      /** Demandes en cours du compte connecté ; identifiant, nom et avatar null si le profil ne lui est plus visible. */
      my_contact_requests: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          direction: "incoming" | "outgoing";
          handle: string | null;
          display_name: string | null;
          avatar_id: string | null;
          created_at: string;
        }[];
      };
      /**
       * Comptes bloqués par le compte connecté : identifiant au moment du blocage (null s'il n'était
       * pas visible pour le compte), jamais mis à jour ; rien du profil actuel du bloqué.
       */
      my_blocked_members: {
        Args: Record<string, never>;
        Returns: { id: string; handle: string | null; created_at: string }[];
      };
      /**
       * Partage des cartes (20261019120000_map_sharing.sql) : statuts texte (voir
       * src/lib/supabase/sharing.ts) ; cartes, membres, invitations et liens désignés par des uuid
       * opaques, jamais par un identifiant de compte.
       */
      invite_contact_to_map: { Args: { p_map: string; p_contact: string; p_role: string }; Returns: string };
      answer_map_invitation: {
        Args: { p_invitation: string; p_accept: boolean };
        Returns: { status: string; map_id: string | null }[];
      };
      cancel_map_invitation: { Args: { p_invitation: string }; Returns: string };
      /** Renvoie le jeton du lien (montré une seule fois). */
      create_map_link: {
        Args: { p_map: string; p_role: string; p_max_uses: number; p_hours: number };
        Returns: { status: string; token: string | null }[];
      };
      revoke_map_link: { Args: { p_link: string }; Returns: string };
      preview_map_link: {
        Args: { p_token: string };
        Returns: {
          map_name: string;
          role: string;
          owner_handle: string | null;
          owner_display_name: string | null;
          expires_at: string;
          my_role: string | null;
        }[];
      };
      accept_map_link: { Args: { p_token: string }; Returns: { status: string; map_id: string | null }[] };
      set_map_member_role: { Args: { p_member: string; p_role: string }; Returns: string };
      remove_map_member: { Args: { p_member: string }; Returns: string };
      leave_shared_map: { Args: { p_map: string }; Returns: string };
      acquire_map_lock: {
        Args: { p_map: string };
        Returns: { status: string; holder_name: string | null; expires_at: string | null }[];
      };
      release_map_lock: { Args: { p_map: string }; Returns: boolean };
      open_shared_map: {
        Args: { p_map: string };
        Returns: {
          id: string;
          name: string;
          role: string;
          revision: number;
          updated_at: string;
          data: Json;
          owner_handle: string | null;
          owner_display_name: string | null;
        }[];
      };
      shared_map_state: {
        Args: { p_map: string };
        Returns: {
          name: string;
          role: string;
          revision: number;
          updated_at: string;
          lock_mine: boolean;
          lock_held: boolean;
          lock_holder_name: string | null;
          lock_expires_at: string | null;
        }[];
      };
      maps_shared_with_me: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          name: string;
          role: string;
          updated_at: string;
          stats: Json | null;
          owner_handle: string | null;
          owner_display_name: string | null;
          joined_at: string;
        }[];
      };
      my_map_invitations: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          map_name: string;
          role: string;
          owner_handle: string | null;
          owner_display_name: string | null;
          created_at: string;
          expires_at: string;
        }[];
      };
      /** `p_map` : une seule carte ; absent ou null : toutes les cartes du compte. */
      my_map_shares: {
        Args: { p_map?: string | null };
        Returns: {
          map_id: string;
          kind: string;
          id: string;
          handle: string | null;
          display_name: string | null;
          role: string;
          uses: number | null;
          max_uses: number | null;
          created_at: string;
          expires_at: string | null;
        }[];
      };
      my_map_locks: {
        Args: Record<string, never>;
        Returns: { map_id: string; acquired_at: string; expires_at: string }[];
      };
      my_map_link_uses: {
        Args: Record<string, never>;
        Returns: { map_id: string; used_at: string }[];
      };
      /**
       * Carte collective (20261020120000_collective_map.sql) : statuts texte (voir
       * src/lib/supabase/collective.ts) ; les auteurs n'y figurent que par leur nom affiché et leur
       * identifiant public, jamais par leur identifiant de compte. `p_data` : le
       * contenu de l'élément en JSON compact (48 Kio au plus).
       */
      collective_map_state: {
        Args: Record<string, never>;
        Returns: {
          revision: number;
          is_moderator: boolean;
          has_profile: boolean;
          unread_notices: number;
          my_items: number;
          suspended_until: string | null;
        }[];
      };
      collective_map: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          kind: string;
          data: Json;
          author_name: string | null;
          author_handle: string | null;
          mine: boolean;
          created_at: string;
          updated_at: string;
        }[];
      };
      create_collective_item: {
        Args: { p_id: string; p_kind: string; p_data: string };
        Returns: {
          status: string;
          author_name: string | null;
          created_at: string | null;
          revision_from: number | string | null;
          revision_to: number | string | null;
        }[];
      };
      update_collective_item: {
        Args: { p_id: string; p_data: string };
        Returns: { status: string; revision_from: number | string | null; revision_to: number | string | null }[];
      };
      delete_collective_item: {
        Args: { p_id: string };
        Returns: { status: string; revision_from: number | string | null; revision_to: number | string | null }[];
      };
      report_collective_item: { Args: { p_id: string; p_reason: string; p_details: string; p_good_faith: boolean }; Returns: string };
      block_collective_author: { Args: { p_id: string }; Returns: string };
      collective_moderation_queue: {
        Args: { p_page?: number };
        Returns: {
          id: string;
          kind: string;
          /** Null pour un élément retiré par son auteur dont aucun contenu signalé n'a été copié. */
          data: Json | null;
          status: string;
          author_handle: string | null;
          author_name: string | null;
          /** Null pour un élément retiré par son auteur (état « withdrawn »). */
          created_at: string | null;
          updated_at: string | null;
          open_reports: number;
          reasons: string[];
          details: string[];
          last_report_at: string | null;
          reported_data: Json[] | null;
          /** Nombre d'éléments de toute la file (toutes pages). */
          total: number;
        }[];
      };
      moderate_collective_item: {
        Args: { p_id: string; p_action: string; p_reason: string; p_suspend: boolean };
        Returns: string;
      };
      collective_moderation_log: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          action: string;
          item_id: string;
          item_kind: string;
          item_title: string;
          reason: string;
          reports: number;
          suspended_until: string | null;
          moderator_name: string | null;
          author_handle: string | null;
          author_name: string | null;
          created_at: string;
        }[];
      };
      my_collective_notices: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          role: string;
          action: string;
          item_id: string;
          item_kind: string;
          item_title: string;
          reason: string;
          reports: number | null;
          suspended_until: string | null;
          item_hidden: boolean;
          created_at: string;
          read_at: string | null;
        }[];
      };
      mark_collective_notices_read: { Args: Record<string, never>; Returns: number };
      my_hidden_collective_items: {
        Args: Record<string, never>;
        Returns: { id: string; kind: string; title: string; updated_at: string }[];
      };
      my_collective_items: {
        Args: Record<string, never>;
        Returns: { id: string; kind: string; data: Json; status: string; created_at: string; updated_at: string }[];
      };
      my_collective_reports: {
        Args: Record<string, never>;
        Returns: { item_id: string; reason: string; details: string; status: string; created_at: string; resolved_at: string | null }[];
      };
      my_moderation_decisions: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          action: string;
          item_id: string;
          item_kind: string;
          item_title: string;
          reason: string;
          reports: number;
          suspended_until: string | null;
          created_at: string;
        }[];
      };
      my_collective_account: {
        Args: Record<string, never>;
        Returns: { moderator_since: string | null; suspended_until: string | null; suspended_at: string | null }[];
      };
      my_collective_decisions: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          action: string;
          item_id: string;
          item_kind: string;
          item_title: string;
          reason: string;
          reports: number;
          suspended_until: string | null;
          created_at: string;
        }[];
      };
      my_collective_item_ids: {
        Args: Record<string, never>;
        Returns: { item_id: string; moderated: boolean }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

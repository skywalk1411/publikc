export interface Settings {
  [key: string]: any;
  base_url: string;
  auto_fullscreen: boolean;
  discord_rpc: boolean;
  unlimited_fps: boolean;
  in_process_gpu: boolean;
  menu_keybind: string;
  menu_theme: string;
  menu_opacity: string;
  custom_theme_bg: string;
  custom_theme_text: string;
  custom_theme_accent: string;
  custom_theme_border: string;
  custom_theme_danger: string;
  custom_theme_font: string;
  custom_theme_custom_font: string;
  always_show_ingame_menu: boolean;
  watermark_enabled: boolean;
  watermark_text: string;
  watermark_color: string;
  watermark_size: string;
  css_link: string;
  css_enabled: boolean;
  advanced_css: string;
  perm_crosshair: boolean;
  hide_chat: boolean;
  hide_interface: boolean;
  skip_loading: boolean;
  interface_opacity: number;
  interface_bounds: string;
  hitmarker_link: string;
  killicon_link: string;
  ui_animations: boolean;
  perm_tablist: boolean;
  hide_kill_text: boolean;
  spectate_button: boolean;
  colored_killfeed: boolean;
  hide_teamstate_overlay: boolean;
  chat_height: string;
  weapon_size: string;
  weapon_offset_x: string;
  weapon_offset_y: string;
  weapon_offset_z: string;
  weapon_color: boolean;
  weapon_color_hex: string;
  weapon_rgb: boolean;
  weapon_wireframe: boolean;
  include_arms: boolean;
  ads_power: number;
  rave_mode: boolean;
  lobby_keybind_reminder: boolean;
  customizations: boolean;
  clancustomizations: boolean;
  local_customizations: boolean;
  kd_indicator: boolean;
  custom_list_price: boolean;
  market_names: boolean;
  show_trade_buttons: boolean;
  accept_on_click: boolean;
  general_news: boolean;
  promotional_news: boolean;
  event_news: boolean;
  alert_news: boolean;
}

export interface NewsItem {
  title: string;
  content: string;
  category: 'general' | 'promotional' | 'event' | 'alert';
  img?: string;
  imgType?: 'banner' | 'icon';
  link?: string;
  updatedAt?: number;
  live?: boolean;
}

export interface UserCustomization {
  shortId: string;
  gradient?: {
    rot: string;
    stops: string[];
    shadow?: string;
  };
  animated?: boolean;
  discord?: string;
  booster?: boolean;
  badges?: string[];
}

export interface User {
  name: string;
  shortId: string;
  statusCode?: number;
}

export interface NotificationData {
  message: string;
  icon?: string;
}

export interface SettingsChangedEvent extends CustomEvent {
  detail: {
    setting: string;
    value: any;
  };
}

export interface MapImages {
  [key: string]: string;
}

export interface ClanCustomization {
  clan: string;
  gradient?: {
    rot: string;
    stops: string[];
    shadow?: string;
  };
  animated?: boolean;
}

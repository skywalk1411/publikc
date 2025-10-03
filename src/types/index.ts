export interface Settings {
  [key: string]: any;
  base_url: string;
  auto_fullscreen: boolean;
  discord_rpc: boolean;
  unlimited_fps: boolean;
  in_process_gpu: boolean;
  menu_keybind: string;
  menu_theme: string;
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
  rave_mode: boolean;
  lobby_keybind_reminder: boolean;
  customizations: boolean;
  kd_indicator: boolean;
  custom_list_price: boolean;
  market_names: boolean;
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
  discord?: boolean;
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

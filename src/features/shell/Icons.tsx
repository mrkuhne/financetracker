import type { SVGProps } from 'react';

/** Render once in the shell; <Icon/> references the symbols. Ported from the prototype sprite. */
export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <symbol id="i-home" viewBox="0 0 24 24"><path d="M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/></symbol>
        <symbol id="i-list" viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" strokeWidth="2.2"/></symbol>
        <symbol id="i-target" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/></symbol>
        <symbol id="i-chart" viewBox="0 0 24 24"><path d="M3.5 20h17M5.5 16l4.5-5.5 3.5 3.5 6-7M15.5 7h4v4"/></symbol>
        <symbol id="i-news" viewBox="0 0 24 24"><path d="M4 5h12.5v14H6a2 2 0 0 1-2-2zM16.5 9H20v8a2 2 0 0 1-2 2M7.5 9h5.5M7.5 12.5h5.5M7.5 16h3.5"/></symbol>
        <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
        <symbol id="i-spark" viewBox="0 0 24 24"><path d="M11 3.5l1.9 5.3 5.3 1.9-5.3 1.9L11 18l-1.9-5.4-5.3-1.9 5.3-1.9zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/></symbol>
        <symbol id="i-sliders" viewBox="0 0 24 24"><path d="M4 7h8M18 7h2M4 17h2M12 17h8"/><circle cx="15" cy="7" r="2.5"/><circle cx="9" cy="17" r="2.5"/></symbol>
        <symbol id="i-back" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></symbol>
        <symbol id="i-chev" viewBox="0 0 24 24"><path d="M9.5 5.5 16 12l-6.5 6.5"/></symbol>
        <symbol id="i-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></symbol>
        <symbol id="i-cart" viewBox="0 0 24 24"><path d="M3 4h2.2l2.3 11h10.2L20 8H6.3"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/></symbol>
        <symbol id="i-fork" viewBox="0 0 24 24"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1.5-3.2 4.2-3.2 7.5H17V21"/></symbol>
        <symbol id="i-bus" viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="14" rx="3"/><path d="M5 11h14M8 21v-3.5M16 21v-3.5M8.5 14.3h.01M15.5 14.3h.01" strokeWidth="2"/></symbol>
        <symbol id="i-house" viewBox="0 0 24 24"><path d="M4 10.5 12 4.5l8 6V20H4zM10 20v-5.5h4V20"/></symbol>
        <symbol id="i-bolt" viewBox="0 0 24 24"><path d="M13 3 5.5 13H11l-1 8 7.5-10H12z"/></symbol>
        <symbol id="i-repeat" viewBox="0 0 24 24"><path d="M16.5 3 20 6.5 16.5 10M4 11.5v-1a4 4 0 0 1 4-4h12M7.5 21 4 17.5 7.5 14M20 12.5v1a4 4 0 0 1-4 4H4"/></symbol>
        <symbol id="i-heart" viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/></symbol>
        <symbol id="i-bag" viewBox="0 0 24 24"><path d="M5 8h14l-1.1 13H6.1zM9 8V6.5a3 3 0 0 1 6 0V8"/></symbol>
        <symbol id="i-ticket" viewBox="0 0 24 24"><path d="M3.5 7h17v3a2 2 0 0 0 0 4v3h-17v-3a2 2 0 0 0 0-4zM14.5 7v10" /></symbol>
        <symbol id="i-plane" viewBox="0 0 24 24"><path d="M3 13.5 21 6l-4.5 13-4-5.5zM12.5 13.5 21 6"/></symbol>
        <symbol id="i-gift" viewBox="0 0 24 24"><path d="M4 9h16v4H4zM5.5 13v8h13v-8M12 9v12M12 9C10.5 5 6.5 5.5 7.5 8.3M12 9c1.5-4 5.5-3.5 4.5-.7"/></symbol>
        <symbol id="i-dots" viewBox="0 0 24 24"><path d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth="3"/></symbol>
        <symbol id="i-coin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.4A2.8 2.3 0 0 0 9.5 10c0 2.6 5.2 1.3 5.2 4a2.8 2.3 0 0 1-5.2.6M12 6.5v11"/></symbol>
        <symbol id="i-swap" viewBox="0 0 24 24"><path d="M7 4 3.5 7.5 7 11M3.5 7.5H17M17 13l3.5 3.5L17 20M20.5 16.5H7"/></symbol>
        <symbol id="i-sms" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4zM8 9.5h8M8 12.5h5"/></symbol>
        <symbol id="i-bell" viewBox="0 0 24 24"><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4"/></symbol>
        <symbol id="i-download" viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></symbol>
        <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3.5 19.5 6v6c0 4.6-3.3 7.6-7.5 8.5-4.2-.9-7.5-3.9-7.5-8.5V6z"/><path d="M9 12l2.2 2.2L15.5 10"/></symbol>
        <symbol id="i-wallet" viewBox="0 0 24 24"><path d="M4 7.5h15a1 1 0 0 1 1 1V19H5a1 1 0 0 1-1-1V6.5L15.5 4v3.5M16 13.5h.01" strokeWidth="1.9"/></symbol>
        <symbol id="i-send" viewBox="0 0 24 24"><path d="M4 12 20 4l-6.5 16-2.8-6.7z"/></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></symbol>
        <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></symbol>
        <symbol id="i-key" viewBox="0 0 24 24"><circle cx="8" cy="15.5" r="4"/><path d="M11 12.5 19.5 4M16.5 7l3 3"/></symbol>
        <symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3.2 3 13.8 0 17M12 3.5c-3 3.2-3 13.8 0 17"/></symbol>
        <symbol id="i-piggy" viewBox="0 0 24 24"><path d="M5 11a6 5 0 0 1 6-4.5h2.5A6 5.5 0 0 1 19 9.5l1.5-.5v4l-1.6.6A6 6 0 0 1 16 17v2.5h-2.5V18h-3v1.5H8V17a5.5 5 0 0 1-3-4.5H3.5V10H5M15.5 10.5h.01" strokeWidth="1.8"/></symbol>
        <symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01" strokeWidth="2"/></symbol>
        <symbol id="i-sofa" viewBox="0 0 24 24"><path d="M5 11V8.5A2.5 2.5 0 0 1 7.5 6h9A2.5 2.5 0 0 1 19 8.5V11M3 12.5a1.5 1.5 0 0 1 3 0V14h12v-1.5a1.5 1.5 0 0 1 3 0V18H3zM5 18v2M19 18v2"/></symbol>
        <symbol id="i-edit" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></symbol>
      </defs>
    </svg>
  );
}

export type IconName =
  | 'home'
  | 'list'
  | 'target'
  | 'chart'
  | 'news'
  | 'plus'
  | 'spark'
  | 'sliders'
  | 'back'
  | 'chev'
  | 'close'
  | 'cart'
  | 'fork'
  | 'bus'
  | 'house'
  | 'bolt'
  | 'repeat'
  | 'heart'
  | 'bag'
  | 'ticket'
  | 'plane'
  | 'gift'
  | 'dots'
  | 'coin'
  | 'swap'
  | 'sms'
  | 'bell'
  | 'download'
  | 'shield'
  | 'wallet'
  | 'send'
  | 'check'
  | 'clock'
  | 'key'
  | 'globe'
  | 'piggy'
  | 'info'
  | 'sofa'
  | 'edit';

export function Icon({ name, className = '', ...rest }: { name: IconName | (string & {}) } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg className={`i ${className}`} aria-hidden="true" {...rest}>
      <use href={`#i-${name}`} />
    </svg>
  );
}

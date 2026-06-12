/* eslint-disable react-refresh/only-export-components */
import { type SVGProps } from 'react';

export type IconName =
  | 'droplet'
  | 'leaf'
  | 'ruler'
  | 'camera'
  | 'note'
  | 'scissors'
  | 'pot'
  | 'mist'
  | 'plus'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'sun'
  | 'cloud'
  | 'thermometer'
  | 'heart'
  | 'sparkle'
  | 'drop'
  | 'clock'
  | 'pin'
  | 'bell'
  | 'check'
  | 'arrowUp'
  | 'moon'
  | 'pencil'
  | 'x';

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'stroke'> {
  name: IconName;
  size?: number;
  stroke?: number;
}

export function Icon({
  name,
  size = 24,
  stroke = 2,
  fill = 'none',
  style,
  className,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: 'block', flexShrink: 0, ...style }}
      {...props}
    >
      {(() => {
        switch (name) {
          case 'droplet':
            return <path d="M12 3.2c3.4 4 6 7 6 10.3a6 6 0 0 1-12 0C6 10.2 8.6 7.2 12 3.2Z" />;
          case 'leaf':
            return (
              <>
                <path d="M5 19c0-7 5-13 14-13 0 9-6 14-13 14" />
                <path d="M5 19c2.5-4 5.5-6.5 9-8" />
              </>
            );
          case 'ruler':
            return (
              <>
                <rect x="3" y="7" width="18" height="10" rx="2" />
                <path d="M7 7v3M11 7v4M15 7v3M19 7v3" />
              </>
            );
          case 'camera':
            return (
              <>
                <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                <circle cx="12" cy="13" r="3.2" />
              </>
            );
          case 'note':
            return (
              <>
                <path d="M5 4h11l3 3v13H5Z" />
                <path d="M9 10h6M9 14h4" />
              </>
            );
          case 'scissors':
            return (
              <>
                <circle cx="6" cy="6" r="2.4" />
                <circle cx="6" cy="18" r="2.4" />
                <path d="M8 7.5 20 18M8 16.5 20 6" />
              </>
            );
          case 'pot':
            return (
              <>
                <path d="M5 9h14l-1.5 10.5a1 1 0 0 1-1 .9H7.5a1 1 0 0 1-1-.9Z" />
                <path d="M4 6h16v3H4Z" />
              </>
            );
          case 'mist':
            return (
              <>
                <path d="M8 13c0-3 4-3 4 0M16 13c0-3 4-3 4 0" />
                <path d="M9 4.5v2M13 6v2M5 7v2" />
              </>
            );
          case 'plus':
            return <path d="M12 5v14M5 12h14" />;
          case 'chevronLeft':
            return <path d="M15 5 8 12l7 7" />;
          case 'chevronRight':
            return <path d="M9 5l7 7-7 7" />;
          case 'chevronDown':
            return <path d="M5 9l7 7 7-7" />;
          case 'sun':
            return (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
              </>
            );
          case 'cloud':
            return <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />;
          case 'thermometer':
            return (
              <>
                <path d="M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0Z" />
                <path d="M12 9v6" />
              </>
            );
          case 'heart':
            return <path d="M12 20s-7-4.6-7-9.5A3.6 3.6 0 0 1 12 7a3.6 3.6 0 0 1 7-.5C19 11.4 12 20 12 20Z" />;
          case 'sparkle':
            return <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" />;
          case 'drop':
            return <path d="M12 4c2.6 3 4.5 5.4 4.5 8a4.5 4.5 0 0 1-9 0c0-2.6 1.9-5 4.5-8Z" />;
          case 'clock':
            return (
              <>
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5V12l3 2" />
              </>
            );
          case 'pin':
            return (
              <>
                <path d="M12 21c4-4.5 6-7.5 6-10a6 6 0 1 0-12 0c0 2.5 2 5.5 6 10Z" />
                <circle cx="12" cy="11" r="2.2" />
              </>
            );
          case 'bell':
            return (
              <>
                <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
                <path d="M10 19a2 2 0 0 0 4 0" />
              </>
            );
          case 'check':
            return <path d="M5 12.5 10 17 19 7" />;
          case 'arrowUp':
            return <path d="M12 19V6M6 12l6-6 6 6" />;
          case 'moon':
            return <path d="M20.5 14.8A8.2 8.2 0 0 1 9.2 3.5 7.5 7.5 0 1 0 20.5 14.8Z" />;
          case 'pencil':
            return (
              <>
                <path d="M4 20.5 5 16 16 5l3 3L8 19l-4.5 1.5Z" />
                <path d="M14 7l3 3" />
              </>
            );
          case 'x':
            return <path d="M6 6l12 12M18 6 6 18" />;
          default:
            return <path d="M5 4h11l3 3v13H5Z" />; // default to note/document icon
        }
      })()}
    </svg>
  );
}

export function healthLabel(h: number): string {
  return ['', 'Critical', 'Struggling', 'Okay', 'Healthy', 'Thriving'][h] || '';
}

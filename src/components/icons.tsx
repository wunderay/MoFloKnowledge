import type { ReactNode } from "react";

export type IconName =
  | "companies"
  | "workspace"
  | "profile"
  | "lock"
  | "sign-out"
  | "plus"
  | "refresh"
  | "arrow-up-right"
  | "calendar"
  | "users"
  | "building"
  | "layers"
  | "pin"
  | "truck"
  | "target"
  | "link"
  | "cube"
  | "dollar"
  | "tag"
  | "pencil";

const paths: Record<IconName, ReactNode> = {
  companies: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  workspace: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M9 9v11" /></>,
  profile: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
  "sign-out": <><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 8l4 4-4 4M8 12h13" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.5-1L20 9M4 15l2.4 3A7 7 0 0 0 18 17" /></>,
  "arrow-up-right": <path d="M6 18 18 6M6 6h12v12" />,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.2A6 6 0 0 1 21 20" /></>,
  building: <><path d="M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 9h3a1 1 0 0 1 1 1v11M3 21h18M9 7h2M9 11h2M9 15h2" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5" /></>,
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
  truck: <><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7.5" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></>,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" />,
  cube: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>,
  dollar: <path d="M12 3v18M16.5 7.5C15.5 6.4 14 6 12 6c-2.5 0-4 1.2-4 3 0 4.5 8.5 2 8.5 6.5 0 1.8-1.7 3-4.5 3-2 0-3.7-.5-4.7-1.7" />,
  pencil: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  tag: <><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="8" cy="8" r="1.4" /></>,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" focusable="false"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}>
      {paths[name]}
    </svg>
  );
}

export function ArrowUpRight({ size = 14 }: { size?: number }) {
  return <Icon name="arrow-up-right" size={size} />;
}

export function MoFloMark() {
  return (
    <svg className="brand__mark" width="30" height="30" viewBox="0 0 32 32"
      fill="none" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="15" fill="currentColor" />
      <path d="M7 19v-5.5a3.5 3.5 0 0 1 7 0V19m0-4.5a3.5 3.5 0 0 1 7 0V19m0-2.5a2 2 0 0 0 4 0V12"
        stroke="white" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Brand() {
  return <span className="brand"><MoFloMark /><span>MoFlo<span className="brand__light"> Knowledge</span></span></span>;
}

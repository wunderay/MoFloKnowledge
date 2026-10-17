import type { ReactNode } from "react";

export type IconName =
  | "companies"
  | "workspace"
  | "profile"
  | "lock"
  | "sign-out"
  | "plus"
  | "refresh"
  | "arrow-up-right";

const paths: Record<IconName, ReactNode> = {
  companies: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  workspace: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M9 9v11" /></>,
  profile: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
  "sign-out": <><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 8l4 4-4 4M8 12h13" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.5-1L20 9M4 15l2.4 3A7 7 0 0 0 18 17" /></>,
  "arrow-up-right": <path d="M6 18 18 6M6 6h12v12" />,
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

export function CloudBrand() {
  return <span className="brand"><MoFloMark /><span>MoFlo<span className="brand__light"> Cloud</span></span></span>;
}

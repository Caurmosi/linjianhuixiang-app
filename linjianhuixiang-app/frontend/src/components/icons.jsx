/**
 * icons.jsx
 * 统一 SVG 图标库（描边风格，跟随 currentColor），路径取自高保真原型。
 */

function Svg({ children, size = 22, className = '', filled = false, sw = 2 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/* ===== Logo / 品牌 ===== */
export const IconLeaf = ({ size = 26, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M5 19c0-7 5-13 14-14 0 9-6 14-14 14Z" fill="#c4e6d2" />
    <path d="M5 19C8 14 12 11 17 9" stroke="#0e2a1f" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

/* ===== 底部导航 ===== */
export const IconHome = (p) => (
  <Svg {...p}>
    <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-5h-4v5H5a1 1 0 0 1-1-1v-8Z" />
  </Svg>
);

export const IconChart = (p) => (
  <Svg {...p}>
    <path d="M5 19V9m7 10V5m7 14v-7" />
  </Svg>
);

export const IconMap = (p) => (
  <Svg {...p}>
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
    <path d="M9 4v14m6-12v14" />
  </Svg>
);

export const IconUser = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </Svg>
);

/* ===== 首页动作 ===== */
export const IconUpload = (p) => (
  <Svg {...p}>
    <path d="M12 16V5m0 0L8 9m4-4 4 4" />
    <path d="M5 18h14" />
  </Svg>
);

export const IconPlay = (p) => (
  <Svg filled {...p}>
    <path d="M8 5v14l11-7L8 5Z" />
  </Svg>
);

export const IconMic = (p) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Svg>
);

export const IconClock = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l3 2" />
  </Svg>
);

export const IconChevronRight = (p) => (
  <Svg {...p}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

/* ===== 标题栏 ===== */
export const IconBack = (p) => (
  <Svg {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Svg>
);

export const IconShare = (p) => (
  <Svg {...p}>
    <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" />
  </Svg>
);

/* ===== 分析管线 ===== */
export const IconCheck = (p) => (
  <Svg {...p}>
    <path d="M5 13l4 4 10-11" />
  </Svg>
);

export const IconSpark = (p) => (
  <Svg {...p}>
    <path d="M12 3v3m0 12v3m9-9h-3M6 12H3" />
  </Svg>
);

export const IconInfo = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);

/* ===== 结果入口 ===== */
export const IconDoc = (p) => (
  <Svg {...p}>
    <path d="M5 5h14v14H5z" />
    <path d="M9 9h6M9 13h6M9 17h3" />
  </Svg>
);

export const IconHeat = (p) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 10h16M10 4v16" />
  </Svg>
);

export const IconGlobe = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
  </Svg>
);

export const IconBird = (p) => (
  <Svg {...p}>
    <path d="M5 13c0-4 3-7 7-7s7 3 7 7c-3 1-5 1-7 0-3 1-5 1-7 0Z" />
    <circle cx="15" cy="11" r="1" fill="currentColor" stroke="none" />
  </Svg>
);

/* ===== 设置 ===== */
export const IconFilter = (p) => (
  <Svg {...p}>
    <path d="M5 11l2 2 4-4 8 8" />
  </Svg>
);

export const IconWave = (p) => (
  <Svg {...p}>
    <path d="M4 12h4l3-8 6 16 3-8h4" />
  </Svg>
);

export const IconStar = (p) => (
  <Svg {...p}>
    {/* 标准五角星（M12 中心，外径≈10、内径≈4）*/}
    <path d="M12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21Z" />
  </Svg>
);

export const IconTrash = (p) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7" />
    <path d="M10 11v6m4-6v6" />
  </Svg>
);

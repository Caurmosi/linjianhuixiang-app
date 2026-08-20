/**
 * BottomNav.jsx
 * 底部 4 Tab 导航：首页 / 历史记录 / 地图 / 我的
 */
import { IconHome, IconChart, IconMap, IconUser } from './icons';

const TABS = [
  { id: 'home', label: '首页', Icon: IconHome },
  { id: 'results', label: '历史记录', Icon: IconChart },
  { id: 'map', label: '地图', Icon: IconMap },
  { id: 'me', label: '我的', Icon: IconUser },
];

export default function BottomNav({ tab, onTab }) {
  return (
    <nav className="bottomnav">
      {TABS.map(({ id, label, Icon }) => (
        <button key={id} className={tab === id ? 'active' : ''} onClick={() => onTab(id)}>
          <Icon />
          {label}
        </button>
      ))}
    </nav>
  );
}

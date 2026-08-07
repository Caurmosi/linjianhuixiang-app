/**
 * IndicesScreen.jsx
 * 声学指数：ACI / NDSI / ADI / H 四卡片 + 解读
 */
import { useApp } from '../store/appStore.jsx';
import AppBar from '../components/AppBar';
import Bar from '../components/ui/Bar';
import { IconInfo } from '../components/icons';

export default function IndicesScreen() {
  const { state, dispatch } = useApp();
  const indices = state.analysis.indices;

  return (
    <div>
      <AppBar title="声学指数" onBack={() => dispatch({ type: 'BACK' })} />

      {indices.map((idx) => (
        <div key={idx.key} className="card idx-card plain">
          <div className="top">
            <span className="nm">{idx.key}</span>
            <span className="val">{idx.display}</span>
          </div>
          <div className="desc">
            {idx.name} — {idx.desc}
          </div>
          <Bar value={idx.pct} color="linear-gradient(90deg,var(--sun-soft),var(--sun))" />
        </div>
      ))}

      <div className="method mt-4">
        <h4>
          <IconInfo size={16} />
          如何解读
        </h4>
        <p>四类指数共同量化“声景健康度”。NDSI 与 H 直接反映人为噪声干扰，与生物多样性共同输入宜居度耦合模型。</p>
      </div>
    </div>
  );
}

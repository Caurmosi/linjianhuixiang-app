/**
 * GuideScreen.jsx —— 使用说明（图文教程，含界面示意图）
 * 步骤式快速上手：录音/导入 → 查看结果 → 保存地区 → 公共地图与云备份。
 * 界面示意图为 CSS 绘制的小屏模拟（非真实截图），帮助用户对号入座。
 */
import { useApp } from '../store/appStore.jsx';
import AppBar from '../components/AppBar';
import { openExternal, PUBLIC_MAP_URL } from '../utils/openExternal.js';

/* ---------- CSS 迷你界面示意图 ---------- */
function MiniScreen({ title, body, foot }) {
  return (
    <div
      style={{
        width: 132, height: 246, flex: 'none', borderRadius: 18,
        border: '2.5px solid #d8e2dc', background: '#fbfcfb',
        padding: '8px 7px', display: 'flex', flexDirection: 'column',
        gap: 5, boxShadow: '0 4px 14px rgba(20,45,30,.12)',
      }}
    >
      <div
        style={{
          height: 14, borderRadius: 7, background: '#1b7a4b',
          display: 'flex', alignItems: 'center', padding: '0 5px', gap: 3,
        }}
      >
        <span style={{ width: 4, height: 4, borderRadius: 2, background: '#fff', opacity: 0.9 }} />
        <span style={{ width: 26, height: 3, borderRadius: 2, background: '#fff', opacity: 0.85 }} />
        <span style={{ marginLeft: 'auto', width: 4, height: 4, borderRadius: 2, background: '#fff', opacity: 0.9 }} />
      </div>
      <div style={{ fontSize: 8.5, fontWeight: 700, color: '#22332a', textAlign: 'center', paddingTop: 1 }}>{title}</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>{body}</div>
      {foot}
    </div>
  );
}

const Card = ({ h = 26, color = '#eef4f0', text, sub }) => (
  <div
    style={{
      height: h, borderRadius: 7, background: color, border: '1px solid #e3ece7',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '0 7px',
    }}
  >
    <span style={{ fontSize: 8, fontWeight: 700, color: '#33463c' }}>{text}</span>
    {sub && <span style={{ fontSize: 6.5, color: '#8aa096', marginTop: 1 }}>{sub}</span>}
  </div>
);

const Btn = ({ text, color = '#1b7a4b' }) => (
  <div
    style={{
      height: 16, borderRadius: 8, background: color, color: '#fff',
      fontSize: 7.5, fontWeight: 700, display: 'grid', placeItems: 'center',
    }}
  >
    {text}
  </div>
);

const steps = [
  {
    no: '01',
    title: '录音或导入音频',
    desc: '在首页选择「实时录音」长按录制（建议 30 秒以上），或「导入环境录音」选择手机里的音频文件（可多选批量分析）。',
    screen: (
      <MiniScreen
        title="首页"
        body={
          <>
            <Card text="实时录音" sub="长按录制 · 自动分析" color="#e3f2e9" />
            <Card text="导入环境录音" sub="支持多选 · 批量" />
            <Card text="公共地图" sub="查看全城宜居度" />
            <Card text="鸟种图鉴" sub="城市常见鸟百科" />
          </>
        }
        foot={<Btn text="开始录音" />}
      />
    ),
  },
  {
    no: '02',
    title: '查看分析结果',
    desc: '识别完成后进入结果页：宜居度大卡（0-100 分档）+ 置信度徽标 + 物种清单 / 声学指数 / 热力图等详情入口。',
    screen: (
      <MiniScreen
        title="分析结果"
        body={
          <>
            <Card h={40} text="宜居度 68 分 · 一般" sub="置信度 中 (64%)" color="#fff7e6" />
            <Card text="物种清单 · 2 种" sub="麻雀 / 白头鹎" />
            <Card text="声学指数 ACI/NDSI" />
            <Card text="时间热力图" />
          </>
        }
        foot={<Btn text="查看详情" color="#2e7d52" />}
      />
    ),
  },
  {
    no: '03',
    title: '保存地区 · 上传公共地图',
    desc: '在结果页/地图页把这次分析保存为地区记录（可命名，如「中山公园」）；地区详情里点「上传到公共地图」即同步到云端共享池（署名方式在设置里定）。',
    screen: (
      <MiniScreen
        title="地区详情"
        body={
          <>
            <Card text="中山公园" sub="宜居度 68 · 3 次记录" />
            <Card text="上传到公共地图" color="#e3f2e9" />
            <Card text="趋势 / 对比" sub="多次采样随时间变化" />
          </>
        }
        foot={<Btn text="上传" />}
      />
    ),
  },
  {
    no: '04',
    title: '公共地图网页 · 云备份',
    desc: '首页点「公共地图」在浏览器打开聚合地图，看所有人上传的点；登录账号后在设置页「备份到云端」，换手机登录即可恢复本地数据。',
    screen: (
      <MiniScreen
        title="我的"
        body={
          <>
            <Card text="账号 · 已登录" sub="caurmosi" />
            <Card text="备份到云端" sub="换机可恢复" color="#e3f2e9" />
            <Card text="从云端恢复" />
            <Card text="使用说明" />
          </>
        }
        foot={<Btn text="打开公共地图" />}
      />
    ),
  },
];

export default function GuideScreen() {
  const { dispatch } = useApp();
  return (
    <div>
      <AppBar title="使用说明" onBack={() => dispatch({ type: 'BACK' })} />

      <div className="px-4 pt-2">
        <p className="text-[12.5px] text-ink-soft leading-relaxed mb-4">
          《林间回响》通过录音分析识别鸟种、量化声景与噪声，给城市绿地打宜居度分。
          跟着下面 4 步，两分钟上手 👇
        </p>

        {steps.map((s) => (
          <div
            key={s.no}
            className="guide-card"
            style={{
              display: 'flex', gap: 14, alignItems: 'flex-start',
              background: '#fff', border: '1px solid #e8eeea', borderRadius: 14,
              padding: 14, marginBottom: 12,
            }}
          >
            {s.screen}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="guide-no" style={{ color: '#1b7a4b', fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>
                STEP {s.no}
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#22332a', margin: '3px 0 6px' }}>{s.title}</h3>
              <p style={{ fontSize: 12, color: '#5b7266', lineHeight: 1.7, margin: 0 }}>{s.desc}</p>
            </div>
          </div>
        ))}

        <div
          className="guide-tip"
          style={{
            background: '#eef7f1', border: '1px solid #d2ead9', borderRadius: 12,
            padding: '12px 14px', marginBottom: 20,
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 700, color: '#176a42', margin: '0 0 4px' }}>💡 小贴士</p>
          <p style={{ fontSize: 11.5, color: '#3d6b52', lineHeight: 1.7, margin: 0 }}>
            · 录音建议 30 秒以上、靠近鸟鸣方向，置信度更可靠
            <br />· 数据保存在手机本地，App 升级不丢；卸载/换机前记得「备份到云端」
            <br />· 首页「公共地图」查看所有人上传的宜居度聚合
          </p>
        </div>

        <div style={{ marginBottom: 24 }}>
          <button
            className="w-full py-3 rounded-xl text-white text-[14px] font-bold"
            style={{ background: '#1b7a4b' }}
            onClick={() => openExternal(PUBLIC_MAP_URL)}
          >
            打开公共地图网页
          </button>
        </div>
      </div>
    </div>
  );
}

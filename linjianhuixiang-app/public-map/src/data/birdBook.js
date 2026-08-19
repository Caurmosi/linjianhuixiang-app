/**
 * birdBook.js —— 城市常见鸟类图鉴（精简百科）
 * 供「鸟种图鉴」使用：识别结果中的鸟名 → lookupBird() 查图鉴。
 * 字段：name 中文名 / alias 别名(学名·英文) / feature 特征 / habit 习性 / habitat 栖息分布 / protect 保护级别 / icon 图标色
 */
export const BIRD_BOOK = [
  { name: '麻雀', alias: '树麻雀 · Eurasian Tree Sparrow', feature: '小巧灰褐，脸颊有黑斑，头顶栗色', habit: '成群活动，胆大，常见于人居周边，主食谷物与昆虫', habitat: '全国广布，城乡皆见', protect: '无危(LC)', icon: '#9a8a6a' },
  { name: '白头鹎', alias: '白头翁 · Light-vented Bulbul', feature: '头枕部白色醒目，橄榄绿背，腹白', habit: '常成对或小群，鸣声婉转，喜食果实与昆虫', habitat: '华东华南常见，公园绿地、灌丛', protect: '无危(LC)', icon: '#5f8f5a' },
  { name: '乌鸫', alias: '百舌 · Common Blackbird', feature: '通体黑褐，雄鸟喙橙黄色，善模仿鸣唱', habit: '晨昏鸣唱，地面翻土觅食蚯蚓，胆子较大', habitat: '全国广布，林地、城市绿地', protect: '无危(LC)', icon: '#3d3d3d' },
  { name: '珠颈斑鸠', alias: '野鸽子 · Spotted Dove', feature: '颈侧黑白珠点斑纹，粉褐体色，尾长', habit: '地面走食，受惊扑棱起飞，叫声低沉“咕咕咕”', habitat: '城市、乡村广布', protect: '无危(LC)', icon: '#b08d72' },
  { name: '喜鹊', alias: 'Common Magpie', feature: '黑白配色，长尾带蓝绿金属光泽', habit: '成对或家族群，聪明机警，筑巢于高树/电塔', habitat: '全国广布，平原丘陵', protect: '无危(LC)', icon: '#1f2733' },
  { name: '灰喜鹊', alias: 'Azure-winged Magpie', feature: '灰蓝体羽，头黑，长尾，翼尖白斑', habit: '成群活动，叫声嘈杂，喜食昆虫与浆果', habitat: '华北华东常见，林缘、公园', protect: '无危(LC)', icon: '#5a7d9e' },
  { name: '大山雀', alias: 'Great Tit', feature: '黑头白颊，黄腹带黑纵纹，小巧活泼', habit: '频繁跳跃枝间，捕食害虫，鸣声“子黑黑黑”', habitat: '全国广布，林地、果园', protect: '无危(LC)', icon: '#e0b84c' },
  { name: '银喉长尾山雀', alias: 'Long-tailed Tit', feature: '圆滚滚白胖，尾特长，粉白黑配色', habit: '小群在枝头倒挂觅食，毛球般可爱', habitat: '北方常见，山地灌丛、公园', protect: '无危(LC)', icon: '#f2ede2' },
  { name: '红头长尾山雀', alias: 'Red-headed Tit', feature: '头顶红褐，喉黑，脸颊白，尾长', habit: '成群跳跃觅食，叫声细小“嘶嘶”', habitat: '南方常见，林缘、灌丛', protect: '无危(LC)', icon: '#c25a39' },
  { name: '棕头鸦雀', alias: 'Vinous-throated Parrotbill', feature: '棕褐小巧，尾长，嘴短厚', habit: '成小群在灌丛底层窜动，鸣声细碎', habitat: '广布，芦苇、灌丛、草地', protect: '无危(LC)', icon: '#a5734e' },
  { name: '画眉', alias: 'Hwamei', feature: '白眼圈向后延伸成眉纹，褐色体，鸣声多变悦耳', habit: '鸣唱高手，胆小而机警，喜灌丛隐蔽', habitat: '南方山林、公园灌丛', protect: '国家二级保护', icon: '#a56a3c' },
  { name: '八哥', alias: 'Crested Myna', feature: '通体黑，额前有黑色羽冠，翼有白斑，善学舌', habit: '喜结群，栖于房顶/电杆，模仿人语鸟鸣', habitat: '南方广布，城乡', protect: '无危(LC)', icon: '#2a2a2a' },
  { name: '鹊鸲', alias: 'Oriental Magpie-Robin', feature: '黑白分明，雄鸟上黑下白，尾常上翘抖动', habit: '鸣声清脆多变，喜在屋檐/灌丛活动', habitat: '南方常见，城市绿地', protect: '无危(LC)', icon: '#222c38' },
  { name: '白鹡鸰', alias: 'White Wagtail', feature: '黑白灰配色，尾长，行走时尾上下摆动', habit: '沿水边/路面边走边觅食，飞行波浪状', habitat: '全国广布，水边、空地', protect: '无危(LC)', icon: '#7d8896' },
  { name: '北红尾鸲', alias: 'Daurian Redstart', feature: '雄鸟橙红尾、黑脸灰背，雌鸟灰褐', habit: '停栖时尾不停颤动，喜栖息于屋顶/枝头', habitat: '北方常见，迁徙期南方亦见', protect: '无危(LC)', icon: '#d1652c' },
  { name: '红胁蓝尾鸲', alias: 'Red-flanked Bluetail', feature: '上体蓝灰，两胁橙红，小巧灵巧', habit: '在林下层跳窜觅食，秋冬常见于公园', habitat: '东北繁殖，冬季南方越冬', protect: '无危(LC)', icon: '#4a7fa8' },
  { name: '黄腰柳莺', alias: 'Pallas\'s Leaf Warbler', feature: '极小，橄榄绿，腰际鲜黄，眉纹淡黄', habit: '在高处枝叶间频繁跳啄，鸣声细碎', habitat: '迁徙常见，林地、公园树冠', protect: '无危(LC)', icon: '#8fae4a' },
  { name: '黄眉柳莺', alias: 'Yellow-browed Warbler', feature: '小巧橄榄绿，眉纹黄绿，翅有浅色翼斑', habit: '在树冠层快速觅食，啄食蚜虫等小虫', habitat: '迁徙季极常见，林地', protect: '无危(LC)', icon: '#9cb84e' },
  { name: '暗绿绣眼鸟', alias: 'Japanese White-eye', feature: '白眼圈明显，体小黄绿，喉黄', habit: '结群穿梭花枝，喜食花蜜与小虫', habitat: '南方常见，园林、果林', protect: '无危(LC)', icon: '#7fae4c' },
  { name: '家燕', alias: 'Barn Swallow', feature: '背黑腹白，尾呈深叉，飞行敏捷', habit: '屋檐下筑泥巢，捕食飞行昆虫，春来秋去', habitat: '全国广布，人居区', protect: '无危(LC)', icon: '#2c4a6e' },
  { name: '金腰燕', alias: 'Red-rumped Swallow', feature: '腰际栗黄色明显，腹部有细纵纹', habit: '与家燕相似，常在桥梁/屋檐筑巢', habitat: '广布，山地、乡村、城市', protect: '无危(LC)', icon: '#3f6a8f' },
  { name: '白腰雨燕', alias: 'Pacific Swift', feature: '通体黑褐，腰白，翼长如镰刀', habit: '几乎全天空中盘旋捕虫，不落枝', habitat: '繁殖于山区崖壁，城市上空常见', protect: '无危(LC)', icon: '#33414f' },
  { name: '普通翠鸟', alias: 'Common Kingfisher', feature: '背蓝腹橙，喙长而尖，羽色艳丽', habit: '贴水面飞行，俯冲入水捕鱼，栖于水边枝头', habitat: '全国广布，河湖池塘', protect: '无危(LC)', icon: '#2e7f9e' },
  { name: '戴胜', alias: 'Hoopoe', feature: '头有扇形羽冠，橙褐黑白色，喙细长下弯', habit: '地面啄食昆虫，受惊展开羽冠，有特殊气味', habitat: '广布，开阔地、草坪、果园', protect: '无危(LC)', icon: '#d08a3c' },
  { name: '大斑啄木鸟', alias: 'Great Spotted Woodpecker', feature: '黑白配色，雄鸟枕部红斑，翼有白斑', habit: '攀树啄木取虫，秋季敲树干声清脆', habitat: '全国广布，林地、公园', protect: '无危(LC)', icon: '#d24a3a' },
  { name: '斑姬啄木鸟', alias: 'Speckled Piculet', feature: '极小，黄褐带斑点，尾短', habit: '在细枝上啄食，行动隐蔽', habitat: '南方山地、竹林', protect: '无危(LC)', icon: '#b59a5c' },
  { name: '灰椋鸟', alias: 'White-cheeked Starling', feature: '灰褐体，脸颊白，嘴橙红', habit: '大群活动，鸣声嘈杂，集群掠食果实', habitat: '北方繁殖，南方越冬', protect: '无危(LC)', icon: '#8b8f96' },
  { name: '丝光椋鸟', alias: 'Red-billed Starling', feature: '头颈白色丝光感，体灰褐，嘴红', habit: '结群觅食，喜水边与草地', habitat: '华东华南常见', protect: '无危(LC)', icon: '#a3a9ad' },
  { name: '黑领椋鸟', alias: 'Black-collared Starling', feature: '头白，颈有黑色领环，腹白', habit: '成对或小群，地面觅食，鸣声响亮', habitat: '华南常见，城市绿地', protect: '无危(LC)', icon: '#4a4f55' },
  { name: '斑鸫', alias: 'Dusky Thrush', feature: '黄褐色，胸腹密布黑褐色斑点，眉纹白', habit: '冬季大群，地面翻找落叶下食物', habitat: '北方繁殖，冬季南方广布', protect: '无危(LC)', icon: '#a58a5a' },
  { name: '黄腹鹪莺', alias: 'Yellow-bellied Prinia', feature: '尾长上翘，腹部黄，背部褐，叫声连续', habit: '在草丛芦苇间穿梭鸣叫“滴滴滴”', habitat: '南方湿地、草地、灌丛', protect: '无危(LC)', icon: '#b5a13e' },
  { name: '纯色山鹪莺', alias: 'Plain Prinia', feature: '通体棕褐，尾长，体态轻盈', habit: '在草丛中上下飞窜，鸣声细碎', habitat: '南方开阔草地、农田', protect: '无危(LC)', icon: '#a3825a' },
  { name: '红耳鹎', alias: 'Red-whiskered Bulbul', feature: '头顶黑色高冠，耳后红斑，腹白', habit: '活泼喜叫，喜食果实，常小群活动', habitat: '华南常见，公园、园林', protect: '无危(LC)', icon: '#a83a3a' },
  { name: '黄臀鹎', alias: 'Brown-breasted Bulbul', feature: '灰褐体，臀黄色，头略黑', habit: '结群觅食果实，叫声“叽咕咕”', habitat: '南方山地、城市绿地', protect: '无危(LC)', icon: '#8f8a4e' },
  { name: '小鸊鷉', alias: 'Little Grebe', feature: '小型水鸟，棕褐色，尾退化，善潜水', habit: '潜水捕鱼虾，受惊入水，鸣声似马嘶', habitat: '全国广布，池塘、湖泊', protect: '无危(LC)', icon: '#7a5a48' },
  { name: '黑水鸡', alias: 'Common Moorhen', feature: '通体黑，嘴基红色，脚黄绿，额有红盾', habit: '在浮水植物上行走觅食，警觉性高', habitat: '全国广布，湿地、池塘', protect: '无危(LC)', icon: '#2e3338' },
  { name: '白鹭', alias: 'Little Egret', feature: '通体纯白，嘴黑脚黑，繁殖期饰羽蓬松', habit: '浅水区静立伺机捕鱼，结群栖息', habitat: '全国广布，湿地、水田', protect: '无危(LC)', icon: '#f5f7f6' },
  { name: '池鹭', alias: 'Chinese Pond Heron', feature: '繁殖期头胸栗色背灰，冬羽灰褐带纵纹', habit: '在池塘边缓慢行走觅食，受惊飞起', habitat: '广布，湿地、稻田', protect: '无危(LC)', icon: '#b0815a' },
  { name: '夜鹭', alias: 'Black-crowned Night Heron', feature: '头顶黑蓝，背黑，腹白，红眼', habit: '晨昏活动，夜栖昼伏，集群筑巢', habitat: '广布，城市湿地、公园湖泊', protect: '无危(LC)', icon: '#3d4a5e' },
  { name: '灰头麦鸡', alias: 'Grey-headed Lapwing', feature: '头颈灰，胸黑带，翼有黑斑，腿黄长', habit: '在开阔地走动觅食，受惊盘旋鸣叫', habitat: '迁徙可见，滩涂、草地、农田', protect: '无危(LC)', icon: '#7a8a6e' },
];

/** 图鉴查询：按中文名/别名精确或包含匹配，返回条目或 null */
export function lookupBird(name) {
  if (!name) return null;
  const n = String(name).trim();
  if (!n) return null;
  return (
    BIRD_BOOK.find((b) => b.name === n) ||
    BIRD_BOOK.find((b) => (b.alias || '').includes(n)) ||
    BIRD_BOOK.find((b) => b.name.includes(n)) ||
    null
  );
}

/** 按关键词过滤图鉴（名称/别名），返回条目数组 */
export function searchBirds(keyword) {
  const k = String(keyword || '').trim().toLowerCase();
  if (!k) return BIRD_BOOK;
  return BIRD_BOOK.filter(
    (b) => b.name.toLowerCase().includes(k) || (b.alias || '').toLowerCase().includes(k) || b.feature.includes(keyword.trim())
  );
}

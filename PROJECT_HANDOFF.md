# 🎴 抽王八游戏项目 - 交接文档

## 项目概述

**项目名称**: 英语老麦（抽王八）卡牌游戏
**路径**: `/Users/karnoz/english-old-maid`
**访问地址**: http://127.0.0.1:8000/
**启动命令**: `cd /Users/karnoz/english-old-maid && python3 -m http.server 8000`

---

## 已完成的功能

### ✅ 核心功能
1. **4人卡牌游戏**（1玩家 + 3AI）
2. **22对卡牌配对**（动物图A ↔ 文字图B）
3. **大王卡（Joker）**机制
4. **扇形手牌布局**
5. **卡牌拖拽物理引擎**（弹簧回弹、阻尼、边界限制）

### ✅ 大王卡特效系统（最新完成）
1. **发牌阶段粒子凝聚特效**
   - Three.js 15000粒子系统
   - 4点扩散凝聚
   - 黑屏渐变（800ms渐入）
   - 时长：1.2秒
   - 自适应.tableBg区域

2. **大王卡飞行动画**
   - 弧线轨迹（贝塞尔曲线）
   - 平滑缩小到目标尺寸
   - 方向旋转对齐手牌
   - 90度时切换成卡背图片
   - 时长：560ms

3. **大王卡被抽中动画**
   - 从上家手牌翻转飞到屏幕中央（400ms）
   - 亮相展示（800ms）
   - 飞向目标手牌（560ms）
   - 总时长：1.76秒

### ✅ UI优化
1. **Joker金卡显示**（纯图片，无边框装饰）
2. **卡牌选中效果**（蓝色外框，outline-offset: -3px）
3. **卡牌投影**（box-shadow跟随移动）
4. **AI出牌动画终点修正**（对齐弃牌堆中心点）

---

## 当前存在的问题

### ⚠️ 游戏结束逻辑问题

**症状**：游戏最后可能剩下"Joker + 1-2张不能配对的牌"

**原因**：
- 当前发牌逻辑只保证每个玩家A数量=B数量
- 不保证每个玩家手中的A有对应的B
- 配对牌可能分散在不同玩家手中
- 如果配对牌被其他玩家出掉，会导致剩余牌无法配对

**理论上不应该发生**（因为全局A=B），但实际测试中出现了。

**建议解决方案**（未实施）：
1. 添加发牌验证+重试机制（已尝试但太严格）
2. 或者调试找出配对逻辑的bug

---

## 关键文件说明

### 核心代码
- `src/game.js` - 游戏逻辑（发牌、配对、AI策略）
- `src/ui.js` - UI渲染和动画（3400+行）
- `src/joker-summon.js` - 大王卡粒子特效组件
- `styles.css` - 所有样式
- `index.html` - 主页面（引入Three.js）

### 配置文件
- `约定.md` - 项目约定和技术规范（**重要！**）
  - 坐标系统："屏幕" = `.tableBg` 区域
  - 禁止克隆元素做动画
  - 卡牌尺寸规格
- `deck/image_pairs.js` - 卡牌数据（26对）

### 测试文件
- `test-joker-summon.html` - 粒子凝聚测试
- `test-joker-fly.html` - 飞行轨迹测试
- `test-3d-flip.html` - 3D翻转测试

---

## 重要约定（必读！）

### 1. 坐标系统
- **"屏幕"定义** = `.tableBg` 背景图区域（而非浏览器窗口）
- 所有动画相对于`.tableBg`计算
- 中心点：`tableBgRect.left + width/2`

### 2. 动画约定
- **禁止克隆元素**做动画（直接操作原始DOM）
- 一切动画基于真实物理模拟
- 弹簧回弹、阻尼、弧线轨迹

### 3. 卡牌尺寸
- 玩家手牌：86×124px（scale: 0.85）
- AI上方：52×72px（scale: 1.29）
- AI左右：64×89px（scale: 1.25）
- 弃牌堆：92×132px（scale: 0.82）

---

## 关键参数

### 大王卡特效
```javascript
// 粒子凝聚（src/ui.js:1095）
duration: 1.2秒
黑屏渐入: 800ms
黑屏渐出: 50ms（瞬间）

// 被抽中动画（src/ui.js:1273, 1431）
飞到中间: 400ms
亮相展示: 800ms
飞向目标: 560ms
```

### AI策略（src/game.js:918-970）
```javascript
Joker优先级: +8
能配对的牌: +5（玩家出局后+20）
玩家出局后: 80%概率选最优牌
```

### 发牌配置（src/game.js:150-167）
```javascript
roundMode 0（第一把）: 2-3对起手
roundMode 1（第二把）: 1-2对起手
roundMode 2（第三把）: 2-6对起手
```

---

## Git状态

**未提交的修改**：
- `index.html` - 引入Three.js
- `src/game.js` - AI策略优化
- `src/ui.js` - 大王卡动画集成
- `styles.css` - Joker样式优化
- `约定.md` - 坐标系统约定

**新增文件**：
- `src/joker-summon.js` - 粒子特效
- `assets/joker.png` - 乌龟国王金卡
- 多个测试页面

---

## 待解决的问题

### 🔴 高优先级

1. **游戏结束bug**：最后可能剩下不能配对的牌
   - 需要调试发牌逻辑或配对验证
   - 建议运行诊断脚本（见上文）

2. **普通卡抽牌落点**：飞到手牌上方而非最后一张下方
   - 已修改终点计算（src/ui.js:546-556）
   - 需要测试验证

### 🟡 中优先级

3. **大王卡被抽中动画**：可能有两次飞行重叠
   - 需要检查条件判断逻辑

4. **AI死循环**：玩家出局后AI可能抽不到能配对的牌
   - 已优化AI策略（优先级+20，80%概率）
   - 需要长期测试

---

## 调试技巧

### 检查卡牌分布
```javascript
// 浏览器控制台运行
game.players.forEach((p, i) => {
  console.log(`${p.name}:`, p.hand.map(c => c.id));
});
```

### 检查A/B平衡
```javascript
const allCards = [];
game.players.forEach(p => allCards.push(...p.hand));
allCards.push(...game.discardPile);

const byPair = {};
allCards.forEach(c => {
  if (c.type === 'joker') return;
  if (!byPair[c.pairId]) byPair[c.pairId] = {A:0, B:0};
  if (c.side === 'A') byPair[c.pairId].A++;
  else byPair[c.pairId].B++;
});

Object.keys(byPair).forEach(key => {
  const p = byPair[key];
  if (p.A !== p.B) console.log(`❌ ${key}: A=${p.A}, B=${p.B}`);
});
```

---

## 下一步建议

1. **诊断游戏结束bug**（最重要）
   - 运行上述调试脚本
   - 找出A/B不平衡的root cause
   - 可能需要修改配对验证或发牌逻辑

2. **测试所有动画**
   - 普通卡抽牌落点
   - 大王卡各种动画
   - AI出牌终点

3. **性能优化**
   - 粒子数量可调（当前15000）
   - 动画时长可调

---

## 重要提示

⚠️ **修改代码前必读 `约定.md`**
⚠️ **所有坐标相对于 `.tableBg`，不是 `window`**
⚠️ **禁止使用 `cloneNode()` 做动画**

---

**最后修改时间**: 2026-01-11
**版本**: v1.0（含粒子特效）

# AI 配对出牌动画 (AI Discard Pair Animation)

## 动画效果

当 AI 玩家配对出牌时，两张卡牌从 AI 手牌位置飞向弃牌堆，采用真实的物理模拟。

---

## 核心特性

### 1. **抛物线轨迹（Arc Trajectory）**
- 卡牌沿抛物线弧线飞行，像真实抛出物体一样
- 弧线高度根据飞行距离自动调整：`arcHeight = min(120, dist * 0.25)`
- 抛物线公式：`arcY = -arcHeight * 4 * t * (1 - t)`（峰值在 t=0.5）

### 2. **过冲回弹（Overshoot & Settle）**
- **Phase 1 (0% → 68%)**：快速接近目标，ease-out 缓动
- **Phase 2 (68% → 100%)**：轻微过冲后回弹到目标位置
- 过冲距离：5% of 总飞行距离
- 类似发牌动画的 `dealEnter` 效果

### 3. **翻转动画（Flip）**
- Y轴旋转：0deg（背面）→ 180deg（正面）
- 平滑翻转，在飞行过程中展示卡牌内容

### 4. **翻滚旋转（Tumbling）**
- Z轴旋转：起飞时快速旋转（360°/s），落地时减速到目标角度
- 旋转速度公式：`tumbleSpeed = 360 * (1 - t)`
- 最终角度：使用 hash 函数生成随机角度（-4° ~ 4°）

### 5. **错开发射（Staggered Start）**
- 左卡和右卡起始位置错开：
  - 水平偏移：`±20px`
  - 垂直偏移：`0px` / `-8px`
- 创造更自然的"双手抛出"效果

### 6. **缩放过渡（Scale）**
- 起始大小：86x124px
- 目标大小：根据 CSS 变量 `--scale-discard-pile` 自动调整
- 平滑缩放到弃牌堆大小

---

## 动画参数

```javascript
// 时长
duration: 680ms  // 比旧版快 40ms，更有力道

// 轨迹
arcHeight: min(120, distance * 0.25)  // 抛物线高度
overshootDist: distance * 0.05        // 过冲距离

// 分段
Phase 1: 0% → 68%  (ease-out)        // 快速接近
Phase 2: 68% → 100% (ease-in-out)    // 回弹稳定

// 旋转
flipRotation: 0deg → 180deg          // Y轴翻转
tumbleRotation: 360deg → target      // Z轴翻滚

// 不透明度
opacity: 1.0 → 0.95                  // 轻微淡出
```

---

## 物理公式

### 抛物线轨迹
```javascript
// 水平/垂直位移（线性）
baseX = dx * t
baseY = dy * t

// 抛物线偏移（垂直方向）
arcY = -arcHeight * 4 * t * (1 - t)

// 最终位置
x = baseX + overshoot_x
y = baseY + arcY + overshoot_y
```

### 过冲回弹
```javascript
// Phase 1: 快速接近 + 5% 过冲
if (t <= 0.68) {
  easeT = 1 - (1 - t/0.68)^2.5
  overshoot = 1.05
}

// Phase 2: 从 1.05 回弹到 1.0
else {
  t2 = (t - 0.68) / 0.32
  easeT2 = cubic-bezier ease-in-out
  overshoot = 1.05 - 0.05 * easeT2
}
```

### 翻滚减速
```javascript
// 起飞时快（360°），落地时慢（0°）
tumbleSpeed = 360 * (1 - t)
tumbleRotation = targetAngle + tumbleSpeed * t
```

---

## 视觉时间线

```
T+0ms      T+272ms    T+462ms    T+680ms
(0%)       (40%)      (68%)      (100%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌲         🎴         🎴         🎴
↗          ↗          ↗↘         ↓
起飞       快速接近    过冲       回弹落地
```

---

## 与其他动画的一致性

1. **发牌动画 (dealEnter)**
   - 相同的两段式缓动
   - 相同的过冲 + 回弹
   - 时长接近（420ms vs 680ms）

2. **大王卡飞行 (flyFromRectToRect)**
   - 相同的弧线轨迹算法
   - 相同的过冲比例（5%）
   - 相同的分段结构（68% 转折点）

3. **玩家出牌 (flyToDiscard)**
   - 相同的目标位置计算
   - 相同的左右分堆逻辑（28% / 72%）
   - 相同的 z-index 计算

---

## 代码位置

- **文件**：`src/ui.js`
- **函数**：`animateAiDiscardPair(playerIdx, card1, card2, onComplete)`
- **行数**：约 540-750

---

## 调试日志

函数输出详细日志，方便调试：
```javascript
console.log(`[AI出牌动画] AI${playerIdx} 开始配对出牌动画`)
console.log(`[AI出牌动画] fromRect:`, fromRect)
console.log(`[AI出牌动画] toRect:`, toRect)
```

---

## 测试方法

1. 启动本地服务器：
   ```bash
   python3 -m http.server 8000
   ```

2. 打开浏览器：
   ```
   http://127.0.0.1:8000/english-old-maid/
   ```

3. 开始游戏，观察 AI 配对出牌时的动画效果

4. 打开开发者工具 Console 查看动画日志

---

## 性能优化

- **40步关键帧**：平衡流畅度和性能
- **transform-only 动画**：使用 GPU 加速
- **固定时长**：680ms，避免 jank
- **及时清理**：动画完成后立即移除 DOM 元素

---

## 未来改进方向

- [ ] 根据 AI 位置（上/左/右）调整起飞角度
- [ ] 添加卡牌阴影动态变化
- [ ] 添加音效（whoosh + card flip + thud）
- [ ] 多对连续出牌时的衔接优化

---

## 相关文件

- `src/ui.js` - 主动画逻辑
- `styles.css` - 卡牌样式定义
- `约定.md` - 坐标系统约定
- `FINAL_SOLUTION.md` - 大王卡特效方案

---

**更新时间**：2026-01-11
**版本**：v3.0 - Physics-based Arc Animation

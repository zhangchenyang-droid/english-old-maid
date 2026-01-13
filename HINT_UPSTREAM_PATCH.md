# 上家手牌提示动画补丁

## 需求

当玩家手里没有可配对牌，且还没抽牌时，3秒后提示上家手牌（呼吸动画），引导玩家去抽牌。

## 修改位置

**文件**: `src/ui.js`

### 1. 在 `scheduleHintFromNow` 函数之前添加新函数

**位置**: 约第2542行之前

**添加代码**:
```javascript
// 提示上家手牌（呼吸动画）
function hintUpstreamHand() {
  const upstreamIdx = window.Game.getUpstreamPlayerIndex(game);
  if (upstreamIdx < 0) return;

  const upstreamHandEl = seatHandElByPlayerIndex(upstreamIdx);
  if (!upstreamHandEl) return;

  // 给所有卡背添加呼吸动画
  const cards = upstreamHandEl.querySelectorAll('.miniBack');
  cards.forEach(card => {
    card.classList.add('hintPulseAuto');
  });

  // 5秒后移除动画
  setTimeout(() => {
    cards.forEach(card => {
      card.classList.remove('hintPulseAuto');
    });
  }, 5000);
}
```

### 2. 修改 `scheduleHintFromNow` 函数

**位置**: 约第2542-2555行

**旧代码**:
```javascript
function scheduleHintFromNow() {
  if (hintT) return;
  if (!game || game.gameOver) return;
  const current = game.players[game.currentPlayerIndex];
  if (!current || current.kind !== "human") return;
  if (!window.Game.findAnyPairInHand(game.players[0].hand)) return; // ← 这行要改

  const stamp = lastHumanActionAt;
  hintT = window.setTimeout(() => {
    if (lastHumanActionAt !== stamp) return;
    maybeShowHint(true); // ← 这里要改
  }, HINT_MS);
}
```

**新代码**:
```javascript
function scheduleHintFromNow() {
  if (hintT) return;
  if (!game || game.gameOver) return;
  const current = game.players[game.currentPlayerIndex];
  if (!current || current.kind !== "human") return;

  const stamp = lastHumanActionAt;
  hintT = window.setTimeout(() => {
    if (lastHumanActionAt !== stamp) return;

    // 检查手里是否有可配对的牌
    const hasPair = window.Game.findAnyPairInHand(game.players[0].hand);
    if (hasPair) {
      // 有配对牌：提示手牌
      maybeShowHint(true);
    } else if (!game.turnHasDrawn) {
      // 没有配对牌且还没抽牌：提示上家手牌
      hintUpstreamHand();
    }
  }, HINT_MS);
}
```

## CSS样式（已存在）

`.miniBack` 元素支持 `.hintPulseAuto` 类（金色呼吸动画）：

```css
.faceCard.hintPulseAuto {
  animation: hintPulseAutoBreath 1.8s ease-in-out infinite;
  border-color: rgba(255, 209, 102, 0.55);
  outline: 2px solid rgba(255, 209, 102, 0.25);
}
```

需要确保 `.miniBack` 也能应用这个动画，或者为 `.miniBack` 单独定义类似的动画。

## 测试步骤

1. 开始游戏
2. 出掉所有能配对的牌
3. 停止操作3秒
4. 观察上家手牌是否出现金色呼吸动画
5. 点击上家手牌抽牌
6. 动画应该消失

## 预期效果

- ✅ 3秒无操作后，上家手牌整组呼吸闪烁
- ✅ 金色边框+缩放动画
- ✅ 引导玩家点击抽牌
- ✅ 5秒后或玩家操作后动画消失

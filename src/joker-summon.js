/*
 * Joker Summon Effect - Three.js Particle Materialization
 * 大王卡粒子凝聚特效（仅在发牌阶段触发一次）
 */

window.JokerSummon = (function() {
  'use strict';

  // 检查 Three.js 是否可用
  if (typeof THREE === 'undefined') {
    console.error('[JokerSummon] Three.js not loaded. Falling back to simple animation.');
    return null;
  }

  // Shader代码：Perlin噪声
  const NOISE_GLSL = `
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy));
      vec2 x0 = v - i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m; m = m*m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    // 多点扩散函数（4个种子点）
    float getFormationValue(vec2 uv, float progress, float time) {
      vec2 s[4];
      s[0] = vec2(0.3, 0.2);
      s[1] = vec2(0.7, 0.3);
      s[2] = vec2(0.4, 0.7);
      s[3] = vec2(0.8, 0.8);

      float n = snoise(uv * 4.0 + time * 0.1) * 0.15;
      float combinedDist = 2.0;

      for(int i=0; i<4; i++) {
        float d = distance(uv, s[i]);
        combinedDist = min(combinedDist, d);
      }

      return combinedDist + 0.2 - (progress * 1.8) + n;
    }
  `;

  // 卡牌 Fragment Shader
  const CARD_FS = NOISE_GLSL + `
    uniform float uProgress;
    uniform float uTime;
    uniform sampler2D uTexture;
    uniform float uUseTexture;
    varying vec2 vUv;

    void main() {
      float val = getFormationValue(vUv, uProgress, uTime);

      // 只有 val < 0 时物质才可见
      if (val > 0.0) discard;

      vec3 cardBase;

      if (uUseTexture > 0.5) {
        // 使用 Joker 图片纹理
        vec4 texColor = texture2D(uTexture, vUv);

        // 检测白色区域（Joker图片的白边）并替换成暗金色渐变
        float isWhite = step(0.9, min(min(texColor.r, texColor.g), texColor.b));
        vec3 goldGradient = mix(vec3(0.831, 0.686, 0.463), vec3(0.722, 0.576, 0.353), vUv.y); // 暗金色，上亮下暗 (#d4af76 -> #b8935a)

        cardBase = mix(texColor.rgb, goldGradient, isWhite);
        if (texColor.a < 0.1) discard;
      } else {
        // 默认蓝色渐变
        cardBase = mix(vec3(0.05, 0.12, 0.3), vec3(0.1, 0.5, 0.7), vUv.y);
        float grid = smoothstep(0.96, 1.0, max(sin(vUv.x * 40.0), sin(vUv.y * 60.0)));
        cardBase += grid * 0.2;
      }

      // 凝聚边缘发光
      float edgeMask = smoothstep(-0.18, 0.0, val);
      vec3 edgeColor = mix(vec3(0.0, 0.85, 1.0), vec3(1.0, 1.0, 1.0), snoise(vUv * 8.0 + uTime) * 0.5 + 0.5);

      float glow = pow(edgeMask, 4.0) * 6.0;
      vec3 finalColor = cardBase + edgeColor * glow;

      // 抗锯齿
      float alpha = smoothstep(0.0, -0.015, val);

      gl_FragColor = vec4(finalColor, alpha);
    }
  `;

  // 粒子 Vertex Shader
  const PARTICLE_VS = NOISE_GLSL + `
    uniform float uTime;
    uniform float uProgress;
    attribute vec3 aRandoms;
    attribute vec2 aTargetUV;

    varying float vType;
    varying float vAlpha;
    varying float vLife;

    void main() {
      vType = aRandoms.z;
      vec3 targetPos = vec3((aTargetUV.x - 0.5) * 2.2, (aTargetUV.y - 0.5) * 3.2, 0.01);

      float valAtTarget = getFormationValue(aTargetUV, uProgress, uTime);
      float t = smoothstep(0.25, 0.0, valAtTarget);

      vAlpha = 0.0;
      vec3 pos;

      if (t > 0.0 && t < 1.0) {
        vec3 startPos = targetPos + (aRandoms - 0.5) * 3.5;
        startPos.z += 1.5;

        pos = mix(startPos, targetPos, pow(t, 1.8));

        // 凝聚旋转
        float angle = (1.0 - t) * 4.0 + aRandoms.x * 2.0;
        float s = sin(angle);
        float c = cos(angle);
        vec2 rotXy = mat2(c, -s, s, c) * pos.xy;
        pos.xy = rotXy;

        vAlpha = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.8, 1.0, t));
        vLife = t;
      } else {
        pos = vec3(0.0, -20.0, 0.0);
      }

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      float size = (vType > 0.5) ? (4.0 + aRandoms.y * 12.0) : (2.0 + aRandoms.y * 6.0);
      gl_PointSize = size * (2.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;

  // 粒子 Fragment Shader
  const PARTICLE_FS = `
    varying float vType;
    varying float vAlpha;
    varying float vLife;

    void main() {
      float d = distance(gl_PointCoord, vec2(0.5));
      if (d > 0.5) discard;

      vec3 col = mix(vec3(0.0, 0.6, 1.0), vec3(0.9, 1.0, 1.0), vLife);
      float strength = pow(1.0 - d * 2.0, 2.0);
      gl_FragColor = vec4(col, vAlpha * strength);
    }
  `;

  // 卡牌 Vertex Shader
  const CARD_VS = `
    varying vec2 vUv;
    uniform float uTime;
    uniform float uProgress;

    void main() {
      vUv = uv;
      vec3 pos = position;

      // 出现时的空间扭曲（前60%有扭曲，后40%完全静止）
      float distortionFactor = uProgress < 0.6 ? pow(1.0 - uProgress / 0.6, 4.0) : 0.0;
      float distortion = sin(uv.y * 10.0 + uTime * 2.0) * 0.05 * distortionFactor;
      pos.x += distortion;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;

  /**
   * 创建 Joker 凝聚特效实例
   * @param {Object} options 配置选项
   * @param {string} options.jokerImageUrl - Joker图片URL
   * @param {number} options.duration - 凝聚动画时长（秒）
   * @param {Function} options.onComplete - 完成回调
   */
  function createSummonEffect(options) {
    const {
      jokerImageUrl = './assets/joker.png',
      duration = 4.0,
      onComplete = null,
      sharedContainer = null  // 新增：共享黑屏容器
    } = options;

    let scene, camera, renderer, card, particles;
    let cardMaterial, particleMaterial;
    let startTime = null;
    let animationId = null;
    let isPlaying = false;
    let tableBgRect = null;
    let usingSharedContainer = !!sharedContainer;

    // 获取 .tableBg 的边界（动画开始时计算）
    function getTableBgRect() {
      const tableBg = document.querySelector('.tableBg');
      if (!tableBg) {
        console.warn('[JokerSummon] .tableBg not found, using full window');
        return {
          left: 0,
          top: 0,
          width: window.innerWidth,
          height: window.innerHeight
        };
      }
      return tableBg.getBoundingClientRect();
    }

    // 使用共享容器或创建新容器
    let container = sharedContainer;
    if (!container) {
      container = document.createElement('div');
      container.id = 'joker-summon-container';
      container.style.cssText = `
        position: fixed;
        z-index: 10050;
        background: radial-gradient(ellipse at center, rgba(0,10,25,0.75) 0%, rgba(0,0,0,0.88) 100%);
        backdrop-filter: blur(6px);
        pointer-events: none;
        opacity: 0;
        transition: opacity 1200ms cubic-bezier(0.22, 1, 0.36, 1), backdrop-filter 1200ms cubic-bezier(0.22, 1, 0.36, 1);
        border-radius: 18px;
        overflow: hidden;
      `;
    } else {
      // 使用共享容器时，不添加额外的黑屏背景（共享容器已经有了）
      // 只需调整必要的样式
      container.style.zIndex = '10050';
      container.style.opacity = '1';
      container.style.pointerEvents = 'none';
      // 保持共享容器的背景，不重复添加
    }

    // 初始化 Three.js
    function init() {
      tableBgRect = getTableBgRect();

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(40, tableBgRect.width / tableBgRect.height, 0.1, 1000);
      camera.position.z = 7.5;

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(tableBgRect.width, tableBgRect.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);

      // 加载 Joker 纹理
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(
        jokerImageUrl,
        (texture) => {
          console.log('[JokerSummon] Texture loaded successfully');
          createCard(texture);
          createParticles();
        },
        undefined,
        (err) => {
          console.warn('[JokerSummon] Failed to load texture, using fallback', err);
          createCard(null);
          createParticles();
        }
      );
    }

    // 创建卡牌
    function createCard(texture) {
      // 根据 .tableBg 的宽度计算合适的卡牌尺寸
      // 标准卡牌比例：86x124px，在 880px 宽的桌面上占 ~10%
      const cardWidthRatio = 0.15; // 卡牌宽度占桌面宽度的比例
      const cardAspect = 124 / 86; // 卡牌高宽比
      const tableWidth = tableBgRect ? tableBgRect.width : 880;

      // Three.js 世界坐标中的卡牌尺寸
      const cardWidth = 2.2 * (tableWidth / 880); // 根据桌面实际宽度缩放
      const cardHeight = cardWidth * cardAspect;

      const cardGeometry = new THREE.PlaneGeometry(cardWidth, cardHeight, 128, 128);
      cardMaterial = new THREE.ShaderMaterial({
        vertexShader: CARD_VS,
        fragmentShader: CARD_FS,
        uniforms: {
          uTime: { value: 0 },
          uProgress: { value: 0 },
          uTexture: { value: texture },
          uUseTexture: { value: texture ? 1.0 : 0.0 }
        },
        transparent: true,
        side: THREE.DoubleSide
      });
      card = new THREE.Mesh(cardGeometry, cardMaterial);
      scene.add(card);
    }

    // 创建粒子系统
    function createParticles() {
      const pCount = 15000;
      const pGeom = new THREE.BufferGeometry();
      const pRandoms = new Float32Array(pCount * 3);
      const pTargets = new Float32Array(pCount * 2);

      for (let i = 0; i < pCount; i++) {
        pTargets[i * 2] = Math.random();
        pTargets[i * 2 + 1] = Math.random();
        pRandoms[i * 3] = Math.random();
        pRandoms[i * 3 + 1] = Math.random();
        pRandoms[i * 3 + 2] = Math.random();
      }

      pGeom.setAttribute('aRandoms', new THREE.BufferAttribute(pRandoms, 3));
      pGeom.setAttribute('aTargetUV', new THREE.BufferAttribute(pTargets, 2));

      particleMaterial = new THREE.ShaderMaterial({
        vertexShader: PARTICLE_VS,
        fragmentShader: PARTICLE_FS,
        uniforms: {
          uTime: { value: 0 },
          uProgress: { value: 0 }
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      particles = new THREE.Points(pGeom, particleMaterial);
      scene.add(particles);
    }

    // 动画循环
    function animate(currentTime) {
      if (!isPlaying) return;

      animationId = requestAnimationFrame(animate);

      if (!startTime) startTime = currentTime;
      const elapsed = (currentTime - startTime) / 1000; // 转换为秒
      const progress = Math.min(elapsed / duration, 1.0);

      // 更新 uniforms
      const time = elapsed;
      if (cardMaterial) {
        cardMaterial.uniforms.uTime.value = time;
        cardMaterial.uniforms.uProgress.value = progress;
      }
      if (particleMaterial) {
        particleMaterial.uniforms.uTime.value = time;
        particleMaterial.uniforms.uProgress.value = progress;
      }

      // 卡牌轻微旋转
      if (card) {
        card.rotation.y = Math.sin(time * 0.5) * 0.1;
      }
      if (particles) {
        particles.rotation.y = card ? card.rotation.y : 0;
      }

      renderer.render(scene, camera);

      // 完成回调
      if (progress >= 1.0) {
        stop();
        if (onComplete) {
          onComplete(); // 立即回调，不停留
        }
      }
    }

    // 窗口大小调整
    function onResize() {
      if (!camera || !renderer || !tableBgRect) return;
      tableBgRect = getTableBgRect();
      camera.aspect = tableBgRect.width / tableBgRect.height;
      camera.updateProjectionMatrix();
      renderer.setSize(tableBgRect.width, tableBgRect.height);

      // 更新容器位置和尺寸
      container.style.left = `${tableBgRect.left}px`;
      container.style.top = `${tableBgRect.top}px`;
      container.style.width = `${tableBgRect.width}px`;
      container.style.height = `${tableBgRect.height}px`;
    }

    // 播放动画
    function play() {
      if (isPlaying) return;
      isPlaying = true;
      startTime = null;

      // 获取最新的 .tableBg 边界
      tableBgRect = getTableBgRect();

      if (!usingSharedContainer) {
        // 独立容器：匹配 .tableBg 尺寸
        container.style.left = `${tableBgRect.left}px`;
        container.style.top = `${tableBgRect.top}px`;
        container.style.width = `${tableBgRect.width}px`;
        container.style.height = `${tableBgRect.height}px`;

        document.body.appendChild(container);
        // 触发黑屏渐显（800ms）
        requestAnimationFrame(() => {
          container.style.opacity = '1';
        });
      } else {
        // 共享容器：保持全屏，只需确保可见
        // 不修改尺寸和位置，保持原有的全屏设置
        container.style.opacity = '1';
      }

      window.addEventListener('resize', onResize);
      animationId = requestAnimationFrame(animate);
      console.log('[JokerSummon] Animation started, tableBg size:', tableBgRect.width, 'x', tableBgRect.height);
    }

    // 停止动画
    function stop() {
      isPlaying = false;
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    }

    // 销毁实例
    function destroy() {
      stop();
      window.removeEventListener('resize', onResize);

      // 清理Three.js资源
      if (renderer) {
        renderer.domElement.remove();
        renderer.dispose();
      }
      if (cardMaterial) cardMaterial.dispose();
      if (particleMaterial) particleMaterial.dispose();
      if (card && card.geometry) card.geometry.dispose();
      if (particles && particles.geometry) particles.geometry.dispose();

      // 清理容器
      if (!usingSharedContainer) {
        // 非共享容器：黑屏瞬间消失并移除DOM
        if (container && container.parentNode) {
          container.style.transition = 'none';
          container.style.opacity = '0';
          setTimeout(() => {
            if (container && container.parentNode) {
              container.parentNode.removeChild(container);
            }
          }, 50);
        }
      }
      // 使用共享容器时不移除，由调用者负责清理
      console.log('[JokerSummon] Instance destroyed');
    }

    // 初始化
    init();

    return {
      play,
      stop,
      destroy
    };
  }

  return {
    createSummonEffect
  };
})();

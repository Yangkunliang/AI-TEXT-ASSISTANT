// 获取DOM
const $ = id => document.getElementById(id)
const input = $("inputText")
const result = $("result")
const config = {
  model: "deepseek-chat",
  apiUrl: "https://api.deepseek.com/chat/completions"
}

// 加载用户保存的API Key
let API_KEY = ""
chrome.storage.sync.get(["apiKey"], (res) => {
  API_KEY = res.apiKey || ""
})

// 微信二维码点击放大功能
if ($("wechatQrCode")) {
  $("wechatQrCode").onclick = () => {
    // 创建放大预览容器
    const overlay = document.createElement("div");
    overlay.id = "qr-preview-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999999999;
      cursor: pointer;
    `;

    // 创建图片容器
    const imgContainer = document.createElement("div");
    imgContainer.style.cssText = `
      max-width: 90%;
      max-height: 90%;
      position: relative;
    `;

    // 创建放大图片
    const fullImg = document.createElement("img");
    fullImg.src = $("wechatQrCode").src;
    fullImg.style.cssText = `
      max-width: 80vh;
      max-width: 80vw;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    `;

    // 创建关闭提示
    const hint = document.createElement("div");
    hint.textContent = "点击任意位置关闭";
    hint.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      color: white;
      font-size: 14px;
      opacity: 0.7;
    `;

    imgContainer.appendChild(fullImg);
    overlay.appendChild(imgContainer);
    overlay.appendChild(hint);
    document.body.appendChild(overlay);

    // 点击关闭
    overlay.onclick = () => {
      document.body.removeChild(overlay);
    };
  };
}



// 总结网页
if ($("summaryPage")) {
  $("summaryPage").onclick = async () => {
    if (!checkKey()) return
    show("正在读取页面内容…")
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.body.innerText.slice(0, 10000)
    })
    input.value = res.result.slice(0, 3000)
    ai("请用简洁清晰的中文总结这篇文章，分点列出", input.value)
  };
}

// 润色
if ($("polish")) {
  $("polish").onclick = () => {
    if (!checkKey() || !input.value) return show("请输入内容")
    ai("润色这段文字，通顺、专业、简洁、自然", input.value)
  };
}

// 翻译
if ($("translate")) {
  $("translate").onclick = async () => {
    if (!checkKey()) return
    show("正在读取页面内容…")
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.body.innerText.slice(0, 10000)
    })
    input.value = res.result.slice(0, 3000)
    ai("翻译成流畅自然的中文", input.value)
  };
}
// 截图功能 - 区域截图
if ($("scrollScreenshot")) {
  $("scrollScreenshot").onclick = async () => {
    if (!checkKey()) return;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab.url.startsWith('chrome://')) {
      show("❌ 无法在 chrome:// 页面上截图");
      return;
    }

    show("点击页面选择截图区域...");

    // 先截图并存储
    let screenshotDataUrl = null;
    try {
      screenshotDataUrl = await new Promise((resolve) => {
        chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, resolve);
      });

      if (screenshotDataUrl) {
        await new Promise(r => chrome.storage.local.set({ screenshotData: screenshotDataUrl }, r));
      }
    } catch (e) {
      console.error('截图失败:', e);
    }

    // 注入区域选择脚本到页面
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async () => {
          if (document.getElementById('screenshot-select-overlay')) return;

          // --- 1. 完全保留你的定位遮罩逻辑 ---
          const overlay = document.createElement('div');
          overlay.id = 'screenshot-select-overlay';
          overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.3); z-index: 999999999; cursor: crosshair;`;

          let startX, startY, selectionBox;

          overlay.onmousedown = (e) => {
            startX = e.clientX;
            startY = e.clientY;
            selectionBox = document.createElement('div');
            selectionBox.style.cssText = `position: absolute; border: 2px solid #2d8cf0; background: rgba(45,140,240,0.1); pointer-events: none; z-index: 1000000000;`;
            document.body.appendChild(selectionBox);
          };

          overlay.onmousemove = (e) => {
            if (!selectionBox) return;
            const left = Math.min(startX, e.clientX);
            const top = Math.min(startY, e.clientY);
            const width = Math.abs(e.clientX - startX);
            const height = Math.abs(e.clientY - startY);
            selectionBox.style.left = left + 'px';
            selectionBox.style.top = top + 'px';
            selectionBox.style.width = width + 'px';
            selectionBox.style.height = height + 'px';
          };

          overlay.onmouseup = async () => {
            if (!selectionBox) return;
            const rect = selectionBox.getBoundingClientRect();

            // 校验选区大小
            if (rect.width < 10 || rect.height < 10) {
              document.body.removeChild(selectionBox);
              document.body.removeChild(overlay);
              return;
            }

            // --- 2. 这里的逻辑升级：进入手动拼接预览状态 ---
            overlay.style.background = "transparent"; // 选完后变透明，不遮挡内容
            overlay.style.pointerEvents = "none"; // 允许鼠标滚网页内容

            // 创建预览面板
            const panel = document.createElement('div');
            panel.style.cssText = `position: fixed; right: 20px; top: 20px; width: 180px; height: 500px; background: white; border: 2px solid #2d8cf0; z-index: 1000000001; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); display: flex; flex-direction: column; overflow: hidden; pointer-events: auto;`;
            panel.innerHTML = `
            <div style="background:#2d8cf0; color:white; padding:8px; font-size:12px; text-align:center;">手动拼长图</div>
            <div id="stitch-preview" style="flex:1; overflow-y:auto; background:#eee; padding:5px;"><canvas id="stitch-canvas" style="width:100%;"></canvas></div>
            <div style="padding:10px; display:flex; flex-direction:column; gap:8px;">
                <button id="btn-snap" style="padding:8px; background:#2d8cf0; color:white; border:none; cursor:pointer; border-radius:4px; font-weight:bold;">📸 捕获当前帧</button>
                <div style="display:flex; gap:5px;">
                   <button id="btn-save" style="flex:1; padding:6px; background:#52c41a; color:white; border:none; cursor:pointer; border-radius:4px;">完成保存</button>
                   <button id="btn-cancel" style="flex:1; padding:6px; background:#ff4d4f; color:white; border:none; cursor:pointer; border-radius:4px;">取消</button>
                </div>
                <p style="font-size:10px; color:#999; margin:0; text-align:center;">滚一下对话，点一下捕获</p>
            </div>`;
            document.body.appendChild(panel);

            const canvas = document.getElementById('stitch-canvas');
            const ctx = canvas.getContext('2d');
            const mainCanvas = document.createElement('canvas'); // 存储长图的真实画布
            const mainCtx = mainCanvas.getContext('2d');

            let frames = [];
            const deviceScale = window.devicePixelRatio || 1;

            const captureFrame = async () => {
              // 💡 解决闪烁：使用 visibility 瞬间隐藏
              const hideList = [selectionBox, panel, overlay];
              hideList.forEach(el => el.style.visibility = 'hidden');

              await new Promise(r => setTimeout(r, 100)); // 给百度一点渲染宽容度

              const res = await chrome.runtime.sendMessage({ action: 'captureTab' }); // 假设 background 已有截图监听
              // 如果 background 还是把截图存 storage，则：
              // const result = await new Promise(r => chrome.storage.local.get(['screenshotData'], r));
              // const dataUrl = result?.screenshotData;
              const dataUrl = res?.dataUrl || (await new Promise(r => chrome.storage.local.get(['screenshotData'], r))).screenshotData;

              hideList.forEach(el => el.style.visibility = 'visible');

              if (!dataUrl) return;

              const img = new Image();
              img.src = dataUrl;
              await new Promise(r => img.onload = r);

              // 你的核心裁切逻辑
              const drawScale = img.width / window.innerWidth;
              const frameCanvas = document.createElement('canvas');
              frameCanvas.width = rect.width * drawScale;
              frameCanvas.height = rect.height * drawScale;
              const fCtx = frameCanvas.getContext('2d');
              fCtx.drawImage(img, rect.left * drawScale, rect.top * drawScale, rect.width * drawScale, rect.height * drawScale, 0, 0, frameCanvas.width, frameCanvas.height);

              frames.push(frameCanvas);

              // 垂直拼接
              mainCanvas.width = frameCanvas.width;
              mainCanvas.height = frameCanvas.height * frames.length;
              frames.forEach((f, i) => {
                mainCtx.drawImage(f, 0, i * frameCanvas.height);
              });

              // 更新预览
              canvas.width = 160;
              canvas.height = mainCanvas.height * (160 / mainCanvas.width);
              ctx.drawImage(mainCanvas, 0, 0, canvas.width, canvas.height);
              document.getElementById('stitch-preview').scrollTop = 99999;
            };

            // 按钮点击事件
            document.getElementById('btn-snap').onclick = captureFrame;
            document.getElementById('btn-cancel').onclick = () => {
              document.body.removeChild(panel);
              document.body.removeChild(selectionBox);
              document.body.removeChild(overlay);
            };
            document.getElementById('btn-save').onclick = () => {
              mainCanvas.toBlob(async (blob) => {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                alert('长截图已拼合并复制！');
                document.getElementById('btn-cancel').onclick();
              });
            };

            // 自动捕获第一帧
            await captureFrame();
          };

          document.body.appendChild(overlay);
        }
      });
    } catch (e) {
      console.error('注入失败:', e);
      show("截图失败");
    }
  };
}

// 滚动截图功能 - 类似飞书的滚动截图
if ($("scrollCapture")) {
  $("scrollCapture").onclick = async () => {
    if (!checkKey()) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url.startsWith('chrome://')) { show("❌ 无法在系统页面上截图"); return; }
    show("正在准备截图环境...");

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        if (document.getElementById('ss-full-mask')) return;

        // 1. 建立视口固定遮罩 (Fixed)
        const mask = document.createElement('div');
        mask.id = 'ss-full-mask';
        mask.style.cssText = `position:fixed; top:0; left:0; width:100%; height:100%; z-index:2147483640; background:rgba(0,0,0,0.5); cursor:crosshair;`;

        const selection = document.createElement('div');
        selection.id = 'ss-selection';
        selection.style.cssText = `position:fixed; border:2px solid #2d8cf0; background:rgba(45,140,240,0.1); pointer-events:none; box-shadow:0 0 0 9999px rgba(0,0,0,0.5); z-index:2147483641; display:none; opacity:1; transition:opacity 0.1s;`;

        const hint = document.createElement('div');
        hint.style.cssText = `position:fixed; top:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:white; padding:10px 24px; border-radius:30px; font-size:14px; z-index:2147483647; pointer-events:none;`;
        hint.innerText = "请框选区域，松手后滚动网页";
        document.body.append(mask, hint);

        let isDrawing = false, sX, sY, rect = null;
        mask.onmousedown = (e) => {
          isDrawing = true; sX = e.clientX; sY = e.clientY;
          selection.style.display = 'block';
          document.body.appendChild(selection);
        };
        mask.onmousemove = (e) => {
          if (!isDrawing) return;
          const x = Math.min(sX, e.clientX), y = Math.min(sY, e.clientY);
          const w = Math.abs(e.clientX - sX), h = Math.abs(e.clientY - sY);
          selection.style.left = x + 'px'; selection.style.top = y + 'px';
          selection.style.width = w + 'px'; selection.style.height = h + 'px';
          rect = { x, y, w, h };
        };

        mask.onmouseup = () => { if (rect && rect.w > 20) startCapture(); };

        const startCapture = async () => {
          hint.innerText = "📸 滚动捕获中... 结束后点击右下方 ✓";
          mask.style.pointerEvents = 'none';

          // 2. 侧边预览 (紧贴选区边缘)
          const isRightSpace = (window.innerWidth - rect.x - rect.w) > 140;
          const sideView = document.createElement('div');
          sideView.style.cssText = `position:fixed; 
            left: ${isRightSpace ? (rect.x + rect.w + 10) : (rect.x - 130)}px; 
            top: ${rect.y}px; 
            width: 120px; height: 320px; 
            background: white; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); 
            z-index: 2147483645; overflow: hidden; display: flex; flex-direction: column; 
            border: 1px solid #2d8cf0; transition: opacity 0.1s;`;
          sideView.innerHTML = `<div id="p-box" style="flex:1; overflow-y:auto; background:#f5f5f5;"><canvas id="p-cvs" style="width:100%;"></canvas></div>`;

          // 3. 操作按钮：固定在选区【可视区域之外】的右下角
          const ctrl = document.createElement('div');
          // 计算逻辑：尝试放在 rect.x + rect.w（右边缘），如果没空间了就向左挤
          let btnLeft = rect.x + rect.w + 10;
          if (btnLeft + 100 > window.innerWidth) { btnLeft = window.innerWidth - 110; }

          // 尝试放在 rect.y + rect.h（下边缘），如果没空间了就向上挤
          let btnTop = rect.y + rect.h + 10;
          if (btnTop + 60 > window.innerHeight) { btnTop = window.innerHeight - 70; }

          ctrl.style.cssText = `position:fixed; 
            left: ${btnLeft}px; 
            top: ${btnTop}px; 
            display: flex; gap: 10px; z-index: 2147483647; padding: 8px; 
            background: white; border-radius: 30px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); 
            transition: opacity 0.1s; border: 1px solid #eee;`;
          ctrl.innerHTML = `
            <button id="p-ok" style="width:38px; height:38px; border-radius:50%; border:none; background:#2d8cf0; color:white; cursor:pointer; font-size:20px; display:flex; align-items:center; justify-content:center;">✓</button>
            <button id="p-no" style="width:38px; height:38px; border-radius:50%; border:none; background:#f0f0f0; color:#666; cursor:pointer; font-size:20px; display:flex; align-items:center; justify-content:center;">✕</button>
          `;
          document.body.append(sideView, ctrl);

          const pCvs = document.getElementById('p-cvs'), pCtx = pCvs.getContext('2d');
          const state = {
            frames: [],
            lastY: window.scrollY,
            startY: window.scrollY,
            rect: rect,
            dpr: window.devicePixelRatio || 1,
            vh: window.innerHeight,
            isCapturing: false,
            mainCanvas: document.createElement('canvas')
          };
          state.mainCanvas.width = rect.w;

          const doCapture = async () => {
            if (state.isCapturing) return;
            state.isCapturing = true;

            const ui = [sideView, ctrl, hint, selection, mask];
            ui.forEach(el => el.style.opacity = '0');

            await new Promise(r => requestAnimationFrame(() => setTimeout(r, 200)));
            const res = await chrome.runtime.sendMessage({ type: 'captureTab' });
            ui.forEach(el => el.style.opacity = '1');

            if (res?.dataUrl) {
              const img = new Image();
              img.src = res.dataUrl;
              await new Promise(r => img.onload = r);

              const scale = img.width / (window.innerWidth * state.dpr);
              const curY = Math.round(window.scrollY);

              const isFirst = state.frames.length === 0;
              const frameCvs = document.createElement('canvas');
              frameCvs.width = rect.w;

              if (isFirst) {
                frameCvs.height = rect.h;
                frameCvs.getContext('2d').drawImage(img, rect.x * state.dpr * scale, rect.y * state.dpr * scale, rect.w * state.dpr * scale, rect.h * state.dpr * scale, 0, 0, rect.w, rect.h);
              } else if (state.isInnerScrolling) {
                frameCvs.height = rect.h;
                frameCvs.getContext('2d').drawImage(img, rect.x * state.dpr * scale, rect.y * state.dpr * scale, rect.w * state.dpr * scale, rect.h * state.dpr * scale, 0, 0, rect.w, rect.h);
                state.isInnerScrolling = false;
                state.lastY = curY;
              } else {
                const deltaY = Math.min(curY - state.lastY, rect.h);
                if (deltaY <= 2) { state.isCapturing = false; return; }
                frameCvs.height = deltaY;
                frameCvs.getContext('2d').drawImage(img, rect.x * state.dpr * scale, (rect.y + rect.h - deltaY) * state.dpr * scale, rect.w * state.dpr * scale, deltaY * state.dpr * scale, 0, 0, rect.w, deltaY);
              }

              state.frames.push({ cvs: frameCvs });
              let totalH = state.frames.reduce((acc, f) => acc + f.cvs.height, 0);
              state.mainCanvas.height = totalH;
              const mCtx = state.mainCanvas.getContext('2d');
              let hOffset = 0;
              state.frames.forEach(f => { mCtx.drawImage(f.cvs, 0, hOffset); hOffset += f.cvs.height; });

              pCvs.width = 120; pCvs.height = totalH * (120 / rect.w);
              pCtx.drawImage(state.mainCanvas, 0, 0, pCvs.width, pCvs.height);
              document.getElementById('p-box').scrollTop = 99999;
              state.lastY = curY;
            }
            state.isCapturing = false;
          };

          const onScroll = () => {
            clearTimeout(state.timer);
            state.timer = setTimeout(() => {
              if (window.scrollY - state.lastY > 45) doCapture();
            }, 150);
          };
          
          // 监听内部滚动元素
          const scrollableElements = new Set();
          const observeScrollableElements = () => {
            console.log('开始检测可滚动元素...');
            const checkElement = (el) => {
              if (!el || scrollableElements.has(el)) return;
              try {
                const style = window.getComputedStyle(el);
                if ((style.overflow === 'auto' || style.overflow === 'scroll' || 
                    style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                    el.scrollHeight > el.clientHeight) {
                  scrollableElements.add(el);
                  el.addEventListener('scroll', onInnerScroll);
                }
              } catch (e) {}
            };
            
            // 检测现有元素
            document.querySelectorAll('*').forEach(checkElement);
            console.log('检测到的可滚动元素数量:', scrollableElements.size);
            
            // 使用 MutationObserver 持续检测新元素
            const observer = new MutationObserver((mutations) => {
              mutations.forEach((mutation) => {
                if (mutation.addedNodes) {
                  mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                      checkElement(node);
                      node.querySelectorAll && node.querySelectorAll('*').forEach(checkElement);
                    }
                  });
                }
              });
            });
            
            observer.observe(document.body, { childList: true, subtree: true });
            state.scrollObserver = observer;
          };
          
          const onInnerScroll = (e) => {
            console.log('内部元素滚动检测到:', e.target);
            clearTimeout(state.innerTimer);
            state.innerTimer = setTimeout(() => {
              const target = e.target;
              if (target) {
                state.lastInnerY = target.scrollTop;
                state.isInnerScrolling = true;
              }
              doCapture();
            }, 300);
          };

          const cleanup = () => {
            window.removeEventListener('scroll', onScroll);
            scrollableElements.forEach(el => {
              el.removeEventListener('scroll', onInnerScroll);
            });
            scrollableElements.clear();
            if (state.scrollObserver) {
              state.scrollObserver.disconnect();
              state.scrollObserver = null;
            }
            [mask, sideView, ctrl, hint, selection].forEach(el => el && el.remove());
          };

          document.getElementById('p-ok').onclick = () => {
            state.mainCanvas.toBlob(async blob => {
              const item = new ClipboardItem({ 'image/png': blob });
              await navigator.clipboard.write([item]);
              cleanup();
              alert("✅ 截图成功！");
            });
          };
          document.getElementById('p-no').onclick = cleanup;

          window.addEventListener('scroll', onScroll);
          observeScrollableElements();
          doCapture();
        };
      }
    });
  };
}

// 提取文字功能
if ($("extractText")) {
  $("extractText").onclick = async () => {
    if (!checkKey()) return;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    show("正在提取文字...");

    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.body.innerText.slice(0, 10000)
      });

      const text = res.result;
      await navigator.clipboard.writeText(text);

      show("文字已复制到剪贴板");
    } catch (e) {
      console.error('提取文字失败:', e);
      show("提取文字失败，请重试");
    }
  };
}

// 生成二维码功能
if ($("generateQRCode")) {
  $("generateQRCode").onclick = async () => {
    if (!checkKey()) return;

    show("正在生成二维码...");

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentUrl = tab.url;

    if (!currentUrl) {
      show("无法获取当前页面URL");
      return;
    }

    try {
      // 注入二维码生成脚本到当前页面
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (url) => {
          // 简化的二维码生成函数
          const generateSimpleQR = (text, size = 200) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = size;
            canvas.height = size;

            // 白色背景
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, size, size);

            // 简化的二维码模式
            ctx.fillStyle = '#000000';

            // 位置探测图形 (三个角)
            const drawFinderPattern = (x, y) => {
              // 外层黑框 (7x7)
              ctx.fillRect(x, y, 28, 28); // 7*4
              // 内层白框 (5x5)
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(x + 4, y + 4, 20, 20); // 5*4
              // 内层黑框 (3x3)
              ctx.fillStyle = '#000000';
              ctx.fillRect(x + 8, y + 8, 12, 12); // 3*4
            };

            const scale = 4; // 每个模块4px
            drawFinderPattern(0, 0); // 左上
            drawFinderPattern((size / 4 - 7) * 4, 0); // 右上
            drawFinderPattern(0, (size / 4 - 7) * 4); // 左下

            // 随机生成一些数据模块来模拟二维码
            ctx.fillStyle = '#000000';
            for (let y = 2; y < size / 4 - 2; y++) {
              for (let x = 2; x < size / 4 - 2; x++) {
                // 避开定位标记区域
                if (!((x < 8 && y < 8) || (x > size / 4 - 9 && y < 8) || (x < 8 && y > size / 4 - 9))) {
                  if (Math.random() > 0.6) { // 随机填充约40%的模块
                    ctx.fillRect(x * scale, y * scale, scale, scale);
                  }
                }
              }
            }

            return canvas.toDataURL('image/png');
          };

          // 防止重复创建
          if (document.getElementById('qr-code-preview')) {
            document.getElementById('qr-code-preview').remove();
          }

          // 创建预览窗口
          const preview = document.createElement('div');
          preview.id = 'qr-code-preview';
          preview.style.position = 'fixed';
          preview.style.top = '0';
          preview.style.left = '0';
          preview.style.width = '100%';
          preview.style.height = '100%';
          preview.style.background = 'rgba(0,0,0,0.7)';
          preview.style.zIndex = '1000000000';
          preview.style.display = 'flex';
          preview.style.alignItems = 'center';
          preview.style.justifyContent = 'center';

          const content = document.createElement('div');
          content.style.background = 'white';
          content.style.padding = '20px';
          content.style.borderRadius = '8px';
          content.style.textAlign = 'center';
          content.style.maxWidth = '320px';

          const title = document.createElement('div');
          title.textContent = '页面二维码';
          title.style.fontWeight = 'bold';
          title.style.marginBottom = '15px';
          title.style.fontSize = '16px';

          // 生成二维码
          // 使用QRCode Monkey API生成二维码
          const encodedUrl = encodeURIComponent(url);
          const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodedUrl}`;

          // 创建二维码容器
          const qrContainer = document.createElement('div');
          qrContainer.style.cssText = 'width: 200px; height: 200px; margin: 0 auto 15px auto; display: flex; align-items: center; justify-content: center; background: #f5f5f5; border: 1px solid #ddd; border-radius: 8px;';

          // 创建loading元素
          const loading = document.createElement('div');
          loading.innerHTML = '⏳ 生成中...';
          loading.style.cssText = 'color: #666; font-size: 14px;';
          qrContainer.appendChild(loading);

          const img = document.createElement('img');
          img.src = qrCodeUrl;
          img.style.width = '200px';
          img.style.height = '200px';
          img.style.marginBottom = '15px';
          img.style.border = '1px solid #ddd';
          img.style.display = 'none';

          // 图片加载完成后显示
          img.onload = () => {
            qrContainer.innerHTML = '';
            qrContainer.appendChild(img);
            img.style.display = 'block';
          };

          img.onerror = () => {
            qrContainer.innerHTML = '❌ 生成失败';
            qrContainer.style.color = '#ff4d4f';
          };

          const urlText = document.createElement('div');
          const truncatedUrl = url.length > 50 ? url.substring(0, 50) + '...' : url;
          urlText.textContent = truncatedUrl;
          urlText.style.fontSize = '12px';
          urlText.style.marginBottom = '15px';
          urlText.style.wordBreak = 'break-all';
          urlText.style.maxHeight = '60px';
          urlText.style.overflowY = 'auto';
          urlText.style.color = '#666';

          const btnContainer = document.createElement('div');
          btnContainer.style.display = 'flex';
          btnContainer.style.justifyContent = 'center';
          btnContainer.style.gap = '10px';

          const downloadBtn = document.createElement('button');
          downloadBtn.textContent = '下载二维码';
          downloadBtn.style.background = '#2d8cf0';
          downloadBtn.style.color = 'white';
          downloadBtn.style.border = 'none';
          downloadBtn.style.padding = '8px 16px';
          downloadBtn.style.borderRadius = '4px';
          downloadBtn.style.cursor = 'pointer';
          downloadBtn.style.flex = '1';
          downloadBtn.style.maxWidth = '130px';

          const copyBtn = document.createElement('button');
          copyBtn.textContent = '复制链接';
          copyBtn.style.background = '#f5f5f5';
          copyBtn.style.color = '#333';
          copyBtn.style.border = '1px solid #ddd';
          copyBtn.style.padding = '8px 16px';
          copyBtn.style.borderRadius = '4px';
          copyBtn.style.cursor = 'pointer';
          copyBtn.style.flex = '1';
          copyBtn.style.maxWidth = '130px';

          const closeBtn = document.createElement('button');
          closeBtn.textContent = '×';
          closeBtn.style.position = 'absolute';
          closeBtn.style.top = '10px';
          closeBtn.style.right = '15px';
          closeBtn.style.background = 'none';
          closeBtn.style.border = 'none';
          closeBtn.style.fontSize = '20px';
          closeBtn.style.cursor = 'pointer';
          closeBtn.style.color = '#999';
          closeBtn.style.padding = '5px';

          // 下载功能
          downloadBtn.onclick = () => {
            fetch(qrCodeUrl)
              .then(response => response.blob())
              .then(blob => {
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = 'qrcode-' + Date.now() + '.png';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(blobUrl);
              })
              .catch(err => {
                console.error('下载失败:', err);
                alert('下载失败，请重试');
              });
          };

          // 复制链接功能
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(url)
              .then(() => {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = '✓ 已复制';
                setTimeout(() => {
                  copyBtn.textContent = originalText;
                }, 2000);
              }).catch(err => {
                console.error('复制失败:', err);
                alert('复制失败，请重试');
              });
          };

          // 关闭功能
          const closeFunc = () => {
            if (preview.parentNode) {
              document.body.removeChild(preview);
            }
          };

          closeBtn.onclick = closeFunc;
          preview.onclick = (e) => {
            if (e.target === preview) {
              closeFunc();
            }
          };

          content.appendChild(title);
          content.appendChild(qrContainer);
          content.appendChild(urlText);

          btnContainer.appendChild(downloadBtn);
          btnContainer.appendChild(copyBtn);
          content.appendChild(btnContainer);
          content.appendChild(closeBtn);
          preview.appendChild(content);

          document.body.appendChild(preview);
        },
        args: [currentUrl]
      });

      show("二维码已生成并显示");
    } catch (e) {
      console.error('生成二维码失败:', e);
      show("生成二维码失败: " + e.message);
    }
  };
}

// 总结页面功能
if ($("summaryScreenshot")) {
  $("summaryScreenshot").onclick = async () => {
    if (!checkKey()) return;
    show("正在读取页面内容…");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.body.innerText.slice(0, 10000)
    });
    input.value = res.result.slice(0, 3000);
    ai("请用简洁清晰的中文总结这篇文章，分点列出", input.value);
  };
}

// 复制结果
if ($("copyResult")) {
  $("copyResult").onclick = () => {
    navigator.clipboard.writeText(result.innerText)
    show("✅ 已复制到剪贴板")
  };
}

// 清空
if ($("clearAll")) {
  $("clearAll").onclick = () => {
    input.value = ""
    result.innerText = "结果将显示在这里…"
  };
}

// 打开设置
if ($("openSettings")) {
  $("openSettings").onclick = () => {
    chrome.runtime.openOptionsPage()
  };
}

// 二维码放大功能
const qrcodeImage = $("qrcodeImage")
const qrcodeModal = $("qrcodeModal")
const closeBtn = document.querySelector(".close")

if (qrcodeImage && qrcodeModal) {
  qrcodeImage.onclick = () => {
    qrcodeModal.style.display = "flex"
  }

  if (closeBtn) {
    closeBtn.onclick = () => {
      qrcodeModal.style.display = "none"
    }
  }

  // 点击模态框外部关闭
  qrcodeModal.onclick = (e) => {
    if (e.target === qrcodeModal) {
      qrcodeModal.style.display = "none"
    }
  }
}



// AI 请求
async function ai(systemPrompt, userText) {
  show("⌛ AI 处理中…")
  try {
    const resp = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText }
        ],
        temperature: 0.6
      })
    })
    const data = await resp.json()
    const txt = data.choices?.[0]?.message?.content || "请求失败，请检查API Key或余额"
    show(txt)
    saveHistory(txt)
  } catch (e) {
    show("❌ 错误：" + e.message)
  }
}

// 工具
function show(txt) { result.innerText = txt }
function checkKey() {
  if (!API_KEY) {
    show("⚠️ 请先设置您的API Key")
    return false
  }
  return true
}
function saveHistory(text) {
  chrome.storage.local.get(["history"], (res) => {
    let list = res.history || []
    list.unshift({ time: new Date().toLocaleString(), text })
    if (list.length > 30) list = list.slice(0, 30)
    chrome.storage.local.set({ history: list })
  })
}

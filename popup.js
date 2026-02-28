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

          const overlay = document.createElement('div');
          overlay.id = 'screenshot-select-overlay';
          overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.3);
            z-index: 999999999;
            cursor: crosshair;
          `;

          let startX, startY, selectionBox;

          overlay.onmousedown = (e) => {
            startX = e.clientX;
            startY = e.clientY;
            selectionBox = document.createElement('div');
            selectionBox.style.cssText = `
              position: absolute;
              border: 2px solid #2d8cf0;
              background: rgba(45,140,240,0.1);
              pointer-events: none;
            `;
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
            document.body.removeChild(selectionBox);
            document.body.removeChild(overlay);

            if (rect.width < 10 || rect.height < 10) return;

            // 从storage获取截图数据
            const result = await new Promise(r => chrome.storage.local.get(['screenshotData'], r));
            const dataUrl = result?.screenshotData;

            if (!dataUrl) {
              alert('截图失败：没有截图数据');
              return;
            }

            // 用canvas裁剪图片
            const img = new Image();
            img.src = dataUrl;

            await new Promise(r => img.onload = r);

            const canvas = document.createElement('canvas');
            const scale = img.width / window.innerWidth;
            canvas.width = rect.width * scale;
            canvas.height = rect.height * scale;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img,
              rect.left * scale, rect.top * scale,
              rect.width * scale, rect.height * scale,
              0, 0, canvas.width, canvas.height
            );

            canvas.toBlob(async (blob) => {
              let copied = false;

              if (typeof ClipboardItem !== 'undefined') {
                try {
                  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                  copied = true;
                } catch (e) {
                  console.error('Clipboard API 失败:', e);
                }
              }

              if (!copied) {
                try {
                  const dataUrl = canvas.toDataURL('image/png');
                  chrome.runtime.sendMessage({
                    action: 'writeToClipboard',
                    dataType: 'image',
                    dataUrl: dataUrl
                  }, (response) => {
                    if (!response || !response.success) {
                      console.error('Background 写入失败:', response?.error);
                    }
                  });
                } catch (e) {
                  console.error('消息发送失败:', e);
                }
              }

              const success = document.createElement('div');
              success.style.cssText = `
                position: fixed;
                top: 60px;
                left: 50%;
                transform: translateX(-50%);
                background: #52c41a;
                color: white;
                padding: 10px 20px;
                border-radius: 4px;
                font-size: 14px;
                z-index: 1000000;
              `;
              success.textContent = '截图成功，已复制到剪贴板';
              document.body.appendChild(success);

              setTimeout(() => document.body.removeChild(success), 3000);
            });
          };

          overlay.onclick = (e) => {
            if (e.target === overlay) {
              document.body.removeChild(overlay);
            }
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
      // func: async () => {
      //   if (document.getElementById('ss-overlay')) return;

      //   // 1. 创建 UI 遮罩层
      //   const overlay = document.createElement('div');
      //   overlay.id = 'ss-overlay';
      //   overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 99999999; background: rgba(0,0,0,0.3); cursor: crosshair;`;
      //   const selection = document.createElement('div');
      //   selection.style.cssText = `position: absolute; border: 2px solid #2d8cf0; background: rgba(45,140,240,0.1); pointer-events: none; box-shadow: 0 0 0 9999px rgba(0,0,0,0.3);`;
      //   const panel = document.createElement('div');
      //   panel.style.cssText = `position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: white; border-radius: 8px; padding: 12px 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: flex; gap: 12px; align-items: center; z-index: 100000000; font-size: 14px;`;
      //   panel.innerHTML = `<span>请拖拽选择截图区域</span>
      //     <button id="ss-ok" style="background:#2d8cf0;color:white;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;opacity:0.5" disabled>开始截图</button>
      //     <button id="ss-close" style="background:#eee;border:1px solid #ccc;border-radius:4px;padding:6px 12px;cursor:pointer">取消</button>`;
      //   document.body.append(overlay, panel);

      //   let isDrawing = false, startX, startY, rect = null;

      //   overlay.onmousedown = (e) => {
      //     isDrawing = true; startX = e.clientX; startY = e.clientY;
      //     overlay.appendChild(selection);
      //   };
      //   overlay.onmousemove = (e) => {
      //     if (!isDrawing) return;
      //     const x = Math.min(startX, e.clientX), y = Math.min(startY, e.clientY);
      //     const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
      //     selection.style.left = x + 'px'; selection.style.top = y + 'px';
      //     selection.style.width = w + 'px'; selection.style.height = h + 'px';
      //     rect = { x, y, w, h };
      //   };
      //   overlay.onmouseup = () => {
      //     isDrawing = false;
      //     if (rect && rect.w > 20) {
      //       const ok = document.getElementById('ss-ok');
      //       ok.disabled = false; ok.style.opacity = '1';
      //     }
      //   };

      //   // 2. 开始截图逻辑
      //   document.getElementById('ss-ok').onclick = async () => {
      //     overlay.style.display = 'none';

      //     // 创建实时预览窗口
      //     const preRoot = document.createElement('div');
      //     preRoot.style.cssText = `position: fixed; top: 70px; right: 20px; width: 220px; background: white; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); z-index: 100000001; overflow: hidden;`;
      //     preRoot.innerHTML = `<div style="padding:8px;background:#2d8cf0;color:white;font-size:12px">正在实时拼接预览...</div>
      //       <div id="p-box" style="max-height:300px;overflow-y:auto;background:#f5f5f5">
      //         <canvas id="p-cvs" style="width:100%;display:block"></canvas>
      //       </div>
      //       <div style="padding:8px;text-align:right"><button id="p-done" style="padding:5px 12px;background:#2d8cf0;color:white;border:none;border-radius:4px;cursor:pointer">完成并复制</button></div>`;
      //     document.body.appendChild(preRoot);

      //     const pCvs = document.getElementById('p-cvs'), pCtx = pCvs.getContext('2d');
      //     const offCvs = document.createElement('canvas'), offCtx = offCvs.getContext('2d');

      //     const state = {
      //       frames: [],
      //       lastY: window.scrollY,
      //       rect: rect,
      //       dpr: window.devicePixelRatio || 1,
      //       vh: window.innerHeight
      //     };

      //     // 自动隐藏固定元素避免重影
      //     const fixeds = Array.from(document.querySelectorAll('*')).filter(el => {
      //       const s = getComputedStyle(el);
      //       return (s.position === 'fixed' || s.position === 'sticky') && !el.contains(preRoot);
      //     });
      //     fixeds.forEach(el => el.style.visibility = 'hidden');

      //     const doCapture = async () => {
      //       preRoot.style.visibility = 'hidden';
      //       await new Promise(r => setTimeout(r, 150));
      //       const res = await chrome.runtime.sendMessage({ type: 'captureTab' });
      //       preRoot.style.visibility = 'visible';

      //       if (res?.dataUrl) {
      //         const img = new Image();
      //         img.src = res.dataUrl;
      //         await new Promise(r => img.onload = r);

      //         const frame = document.createElement('canvas');
      //         frame.width = state.rect.w; frame.height = state.vh;
      //         const fCtx = frame.getContext('2d');

      //         // 【核心修复：重叠问题】计算 captureVisibleTab 截取图片的真实比例
      //         // 必须考虑浏览器缩放和 DPR 的综合影响
      //         const scale = img.width / (window.innerWidth * state.dpr);
      //         fCtx.drawImage(img,
      //           state.rect.x * state.dpr * scale, 0,
      //           state.rect.w * state.dpr * scale, state.vh * state.dpr * scale,
      //           0, 0, state.rect.w, state.vh
      //         );

      //         state.frames.push({ cvs: frame, y: window.scrollY });

      //         // 【核心修复：闪烁问题】离屏更新预览
      //         const pW = 220;
      //         const pScale = pW / state.rect.w;
      //         const totalH = state.frames.length * state.vh * pScale;

      //         // 仅在必要时扩容，扩容不重置 offCanvas 的绘图上下文
      //         if (offCvs.height < totalH) offCvs.height = totalH;
      //         offCvs.width = pW;

      //         state.frames.forEach((f, i) => {
      //           offCtx.drawImage(f.cvs, 0, i * state.vh * pScale, pW, state.vh * pScale);
      //         });

      //         pCvs.width = offCvs.width; pCvs.height = offCvs.height;
      //         pCtx.drawImage(offCvs, 0, 0);
      //         document.getElementById('p-box').scrollTop = 99999;
      //       }
      //     };

      //     const handleScroll = () => {
      //       if (Math.abs(window.scrollY - state.lastY) > state.vh * 0.75) {
      //         state.lastY = window.scrollY;
      //         doCapture();
      //       }
      //     };

      //     window.addEventListener('scroll', handleScroll);
      //     doCapture();

      //     document.getElementById('p-done').onclick = async () => {
      //       window.removeEventListener('scroll', handleScroll);
      //       fixeds.forEach(el => el.style.visibility = 'visible');

      //       const final = document.createElement('canvas');
      //       const sorted = state.frames.sort((a, b) => a.y - b.y);
      //       const minY = sorted[0].y, maxY = sorted[sorted.length - 1].y + state.vh;

      //       final.width = state.rect.w; final.height = maxY - minY;
      //       const fCtx = final.getContext('2d');

      //       // 物理绝对坐标拼接
      //       sorted.forEach(f => fCtx.drawImage(f.cvs, 0, f.y - minY));

      //       final.toBlob(async blob => {
      //         const item = new ClipboardItem({ 'image/png': blob });
      //         await navigator.clipboard.write([item]);
      //         preRoot.remove(); overlay.remove(); panel.remove();
      //         // 给一个轻量提示
      //         const toast = document.createElement('div');
      //         toast.textContent = "✅ 已合成长图并复制到剪贴板";
      //         toast.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#52c41a;color:white;padding:10px 20px;border-radius:5px;z-index:999999999`;
      //         document.body.appendChild(toast);
      //         setTimeout(() => toast.remove(), 2500);
      //       });
      //     };
      //   };
      //   document.getElementById('ss-close').onclick = () => { overlay.remove(); panel.remove(); };
      // }
      func: async () => {
        if (document.getElementById('ss-overlay')) return;

        // 1. UI 遮罩
        const overlay = document.createElement('div');
        overlay.id = 'ss-overlay';
        overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 99999999; background: rgba(0,0,0,0.3); cursor: crosshair;`;
        const selection = document.createElement('div');
        selection.style.cssText = `position: absolute; border: 2px solid #2d8cf0; background: rgba(45,140,240,0.1); pointer-events: none; box-shadow: 0 0 0 9999px rgba(0,0,0,0.3);`;
        const panel = document.createElement('div');
        panel.style.cssText = `position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: white; border-radius: 8px; padding: 12px 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: flex; gap: 12px; align-items: center; z-index: 100000000; font-size: 14px;`;
        panel.innerHTML = `<span>请选区（搜索框需在选区内）</span>
          <button id="ss-ok" style="background:#2d8cf0;color:white;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;opacity:0.5" disabled>开始截图</button>
          <button id="ss-close" style="background:#eee;border:1px solid #ccc;border-radius:4px;padding:6px 12px;cursor:pointer">取消</button>`;
        document.body.append(overlay, panel);

        let isDrawing = false, startX, startY, rect = null;
        overlay.onmousedown = (e) => { isDrawing = true; startX = e.clientX; startY = e.clientY; overlay.appendChild(selection); };
        overlay.onmousemove = (e) => {
          if (!isDrawing) return;
          const x = Math.min(startX, e.clientX), y = Math.min(startY, e.clientY);
          const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
          selection.style.left = x + 'px'; selection.style.top = y + 'px';
          selection.style.width = w + 'px'; selection.style.height = h + 'px';
          rect = { x, y, w, h };
        };
        overlay.onmouseup = () => {
          isDrawing = false;
          if (rect && rect.w > 20) {
            const ok = document.getElementById('ss-ok');
            ok.disabled = false; ok.style.opacity = '1';
          }
        };

        document.getElementById('ss-ok').onclick = async () => {
          overlay.style.display = 'none';

          const preRoot = document.createElement('div');
          preRoot.style.cssText = `position: fixed; top: 70px; right: 20px; width: 220px; background: white; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); z-index: 100000001; overflow: hidden;`;
          preRoot.innerHTML = `<div style="padding:8px;background:#2d8cf0;color:white;font-size:12px">正在截图... (请向下滚动)</div>
            <div id="p-box" style="max-height:300px;overflow-y:auto;background:#eee">
              <canvas id="p-cvs" style="width:100%;display:block"></canvas>
            </div>
            <div style="padding:8px;text-align:right"><button id="p-done" style="padding:5px 12px;background:#2d8cf0;color:white;border:none;border-radius:4px;cursor:pointer">停止并导出</button></div>`;
          document.body.appendChild(preRoot);

          const pCvs = document.getElementById('p-cvs'), pCtx = pCvs.getContext('2d');
          const offCvs = document.createElement('canvas'), offCtx = offCvs.getContext('2d');

          const state = {
            frames: [],
            lastY: window.scrollY,
            startY: window.scrollY,
            rect: rect,
            dpr: window.devicePixelRatio || 1,
            vh: window.innerHeight,
            isCapturing: false
          };

          // 获取所有固定元素
          const fixeds = Array.from(document.querySelectorAll('*')).filter(el => {
            const s = getComputedStyle(el);
            return (s.position === 'fixed' || s.position === 'sticky') && !el.contains(preRoot);
          });

          const doCapture = async () => {
            if (state.isCapturing) return;
            state.isCapturing = true;

            // 💡 只有非第一帧才隐藏固定元素，解决“搜索框没截到”的问题
            if (state.frames.length > 0) {
              fixeds.forEach(el => el.style.opacity = '0');
            }

            // 💡 仅让预览框透明而非隐藏，减少布局抖动
            preRoot.style.opacity = '0.05';
            await new Promise(r => setTimeout(r, 100));

            const res = await chrome.runtime.sendMessage({ type: 'captureTab' });
            preRoot.style.opacity = '1';
            fixeds.forEach(el => el.style.opacity = '1'); // 截图完立即恢复

            if (res?.dataUrl) {
              const img = new Image();
              img.src = res.dataUrl;
              await new Promise(r => img.onload = r);

              const currentY = window.scrollY;
              const frame = document.createElement('canvas');
              frame.width = state.rect.w;
              frame.height = state.vh;
              const fCtx = frame.getContext('2d');

              // 💡 核心校准：计算 captureVisibleTab 物理像素与逻辑像素的真实缩放比
              const scale = img.width / (window.innerWidth * state.dpr);

              fCtx.drawImage(img,
                state.rect.x * state.dpr * scale, 0,
                state.rect.w * state.dpr * scale, state.vh * state.dpr * scale,
                0, 0, state.rect.w, state.vh
              );

              state.frames.push({ cvs: frame, y: currentY });

              // 更新预览
              const pW = 220;
              const pScale = pW / state.rect.w;
              const totalH = (currentY - state.startY + state.vh) * pScale;

              offCvs.width = pW; offCvs.height = totalH;
              state.frames.forEach(f => {
                offCtx.drawImage(f.cvs, 0, (f.y - state.startY) * pScale, pW, state.vh * pScale);
              });

              pCvs.width = offCvs.width; pCvs.height = offCvs.height;
              pCtx.drawImage(offCvs, 0, 0);
              document.getElementById('p-box').scrollTop = 99999;
            }
            state.isCapturing = false;
          };

          const handleScroll = () => {
            // 每滚动 60% 视口截一次，增加重叠覆盖面以确保无缝
            if (Math.abs(window.scrollY - state.lastY) > state.vh * 0.6) {
              state.lastY = window.scrollY;
              doCapture();
            }
          };

          window.addEventListener('scroll', handleScroll);
          doCapture();

          document.getElementById('p-done').onclick = async () => {
            window.removeEventListener('scroll', handleScroll);
            const final = document.createElement('canvas');
            const sorted = state.frames.sort((a, b) => a.y - b.y);
            const minY = state.startY, maxY = sorted[sorted.length - 1].y + state.vh;

            final.width = state.rect.w;
            final.height = maxY - minY;
            const fCtx = final.getContext('2d');

            // 💡 采用绝对坐标绘制，彻底解决文字重叠
            sorted.forEach(f => {
              fCtx.drawImage(f.cvs, 0, f.y - minY);
            });

            final.toBlob(async blob => {
              const item = new ClipboardItem({ 'image/png': blob });
              await navigator.clipboard.write([item]);
              preRoot.remove(); overlay.remove(); panel.remove();
              alert("✅ 长截图已复制！");
            });
          };
        };
        document.getElementById('ss-close').onclick = () => { overlay.remove(); panel.remove(); };
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

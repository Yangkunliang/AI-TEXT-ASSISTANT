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
              try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                
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
              } catch (err) {
                console.error('复制失败:', err);
                alert('复制到剪贴板失败');
              }
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
  
  if (tab.url.startsWith('chrome://')) {
    show("❌ 无法在 chrome:// 页面上截图");
    return;
  }

  show("正在启动滚动截图...");
  
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['html2canvas.min.js']
    });
    
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        // 防止重复注入
        if (document.getElementById('scroll-screenshot-container')) return;
        
        // 创建主容器
        const container = document.createElement('div');
        container.id = 'scroll-screenshot-container';
        container.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 999999999;
          background: rgba(0,0,0,0.3);
        `;
        
        // 创建选择区域
        const selectionBox = document.createElement('div');
        selectionBox.id = 'scroll-selection-box';
        selectionBox.style.cssText = `
          position: absolute;
          border: 2px solid #2d8cf0;
          background: rgba(45,140,240,0.1);
          pointer-events: none;
          box-shadow: 0 0 0 9999px rgba(0,0,0,0.3);
        `;
        
        // 创建控制面板
        const controlPanel = document.createElement('div');
        controlPanel.id = 'scroll-control-panel';
        controlPanel.style.cssText = `
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: white;
          border-radius: 8px;
          padding: 12px 20px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          display: flex;
          gap: 12px;
          align-items: center;
          z-index: 1000000000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        
        // 提示文本
        const tipText = document.createElement('div');
        tipText.textContent = '拖拽选择截图区域';
        tipText.style.cssText = `
          font-size: 14px;
          color: #333;
          font-weight: 500;
        `;
        
        // 确认按钮
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = '✅ 确认截图';
        confirmBtn.style.cssText = `
          background: #2d8cf0;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 8px 16px;
          font-size: 13px;
          cursor: pointer;
          font-weight: 500;
          transition: background 0.2s;
        `;
        confirmBtn.onmouseenter = () => confirmBtn.style.background = '#1b78d8';
        confirmBtn.onmouseleave = () => confirmBtn.style.background = '#2d8cf0';
        
        // 取消按钮
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = `
          background: #f5f5f5;
          color: #666;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 8px 16px;
          font-size: 13px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
        `;
        cancelBtn.onmouseenter = () => {
          cancelBtn.style.background = '#e6e6e6';
          cancelBtn.style.borderColor = '#ccc';
        };
        cancelBtn.onmouseleave = () => {
          cancelBtn.style.background = '#f5f5f5';
          cancelBtn.style.borderColor = '#ddd';
        };
        
        controlPanel.appendChild(tipText);
        controlPanel.appendChild(confirmBtn);
        controlPanel.appendChild(cancelBtn);
        
        // 状态变量
        let isSelecting = false;
        let startX = 0;
        let startY = 0;
        let selectedRect = null;
        
        // 鼠标按下事件
        container.onmousedown = (e) => {
          if (e.target !== container) return;
          
          isSelecting = true;
          startX = e.clientX;
          startY = e.clientY;
          
          selectedRect = {
            left: startX,
            top: startY,
            width: 0,
            height: 0
          };
          
          selectionBox.style.left = startX + 'px';
          selectionBox.style.top = startY + 'px';
          selectionBox.style.width = '0px';
          selectionBox.style.height = '0px';
          
          container.appendChild(selectionBox);
          tipText.textContent = '拖拽选择截图区域';
        };
        
        // 鼠标移动事件
        container.onmousemove = (e) => {
          if (!isSelecting) return;
          
          const currentX = e.clientX;
          const currentY = e.clientY;
          
          const left = Math.min(startX, currentX);
          const top = Math.min(startY, currentY);
          const width = Math.abs(currentX - startX);
          const height = Math.abs(currentY - startY);
          
          selectionBox.style.left = left + 'px';
          selectionBox.style.top = top + 'px';
          selectionBox.style.width = width + 'px';
          selectionBox.style.height = height + 'px';
          
          selectedRect = { left, top, width, height };
        };
        
        // 鼠标释放事件
        container.onmouseup = () => {
          if (!isSelecting) return;
          
          isSelecting = false;
          
          if (selectedRect && selectedRect.width > 10 && selectedRect.height > 10) {
            tipText.textContent = `已选择区域: ${Math.round(selectedRect.width)} × ${Math.round(selectedRect.height)} 像素 - 点击"确认截图"开始滚动截图，或直接滚动页面`;
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';
            confirmBtn.style.cursor = 'pointer';
            
            // 允许页面滚动，但保持容器可见
            container.style.pointerEvents = 'none';
            container.style.background = 'rgba(0,0,0,0.1)';
            
            // 添加滚动提示
            setTimeout(() => {
              if (selectedRect && selectedRect.width > 10) {
                tipText.textContent = '✅ 区域已选择！现在可以滚动页面，或点击"确认截图"按钮';
              }
            }, 2000);
          } else {
            // 选择区域太小，重置
            if (selectionBox.parentNode) {
              selectionBox.parentNode.removeChild(selectionBox);
            }
            selectedRect = null;
            tipText.textContent = '拖拽选择截图区域';
            confirmBtn.disabled = true;
            confirmBtn.style.opacity = '0.5';
            confirmBtn.style.cursor = 'not-allowed';
            // 恢复阻止滚动
            container.style.pointerEvents = 'auto';
            container.style.background = 'rgba(0,0,0,0.3)';
          }
        };
        
        // 确认截图 - 实时滚动截图（飞书式）
        confirmBtn.onclick = async () => {
          if (!selectedRect || selectedRect.width < 10 || selectedRect.height < 10) return;
          
          // 禁用按钮
          confirmBtn.disabled = true;
          confirmBtn.textContent = '准备实时截图...';
          cancelBtn.disabled = true;
          tipText.textContent = '开始实时滚动截图，请向下滚动页面...';
          
          // 显示实时预览区域
          const previewContainer = document.createElement('div');
          previewContainer.id = 'realtime-preview';
          previewContainer.style.cssText = `
            position: fixed;
            top: 60px;
            right: 20px;
            width: 300px;
            max-height: 80vh;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            z-index: 1000000001;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          `;
          
          previewContainer.innerHTML = `
            <div style="padding: 12px; background: #2d8cf0; color: white; font-weight: 500; font-size: 14px;">
              📸 实时截图预览
            </div>
            <div id="preview-content" style="height: 400px; overflow-y: auto; background: #f5f5f5;">
              <div id="preview-canvas-container" style="position: relative; width: 100%; min-height: 200px; display: flex; align-items: center; justify-content: center;">
                <div style="color: #999; text-align: center;">
                  <div>🔄 等待开始滚动...</div>
                  <div style="font-size: 12px; margin-top: 8px;">请向下滚动页面开始截图</div>
                </div>
              </div>
            </div>
            <div style="padding: 10px; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
              <div id="preview-status" style="font-size: 12px; color: #666;">准备就绪</div>
              <button id="finishRealtimeBtn" style="
                padding: 6px 12px;
                background: #2d8cf0;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 500;
              ">完成截图</button>
            </div>
          `;
          
          document.body.appendChild(previewContainer);
          
          // 实时截图状态管理
          const realtimeState = {
            isCapturing: false,
            capturedSections: [],
            lastScrollY: window.scrollY,
            scrollThreshold: 100, // 滚动阈值
            previewCanvas: null,
            previewCtx: null,
            selectedRect: selectedRect
          };
          
          // 初始化预览画布
          const previewCanvasContainer = document.getElementById('preview-canvas-container');
          const previewCanvas = document.createElement('canvas');
          previewCanvas.style.cssText = 'width: 100%; display: none;';
          previewCanvasContainer.appendChild(previewCanvas);
          realtimeState.previewCanvas = previewCanvas;
          realtimeState.previewCtx = previewCanvas.getContext('2d');
          
          // 更新预览状态
          const updatePreviewStatus = (message) => {
            const statusEl = document.getElementById('preview-status');
            if (statusEl) {
              statusEl.textContent = message;
            }
          };
          
          // 实时截图函数
          const captureVisibleArea = async () => {
            if (realtimeState.isCapturing) return;
            
            realtimeState.isCapturing = true;
            updatePreviewStatus('正在截图...');
            
            try {
              // 获取当前视口信息
              const currentScrollY = window.scrollY;
              const viewportHeight = window.innerHeight;
              const pageWidth = Math.max(
                document.body.scrollWidth,
                document.body.offsetWidth,
                document.documentElement.clientWidth,
                document.documentElement.scrollWidth,
                document.documentElement.offsetWidth
              );
              
              // 触发懒加载
              const triggerLazyLoad = () => {
                const event = new CustomEvent('scroll', { bubbles: true });
                window.dispatchEvent(event);
                const observerEvent = new CustomEvent('scroll', { bubbles: true, detail: { force: true } });
                document.dispatchEvent(observerEvent);
              };
              
              triggerLazyLoad();
              await new Promise(r => setTimeout(r, 500));
              
              // 实时截图当前视口
              const canvas = await html2canvas(document.body, {
                useCORS: true,
                allowTaint: true,
                logging: false,
                scale: 0.5, // 降低分辨率提高性能
                width: pageWidth,
                height: viewportHeight,
                x: 0,
                y: currentScrollY,
                foreignObjectRendering: false,
                removeContainer: true,
                backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
                imageTimeout: 5000,
                ignoreElements: (element) => {
                  const tagName = element.tagName;
                  const className = element.className || '';
                  const id = element.id || '';
                  
                  return tagName === 'SCRIPT' || 
                         tagName === 'NOSCRIPT' ||
                         tagName === 'IFRAME' ||
                         id.includes('scroll-') ||
                         className.includes('scroll-') ||
                         className.includes('screenshot') ||
                         className.includes('control-panel') ||
                         className.includes('modal') ||
                         className.includes('toast') ||
                         className.includes('hint') ||
                         className.includes('extension') ||
                         className.includes('plugin') ||
                         className.includes('preview');
                },
                onclone: (clonedDoc) => {
                  // 隐藏所有扩展UI元素
                  const selectors = [
                    '[id*="scroll-"]', '[class*="scroll-"]',
                    '[id*="screenshot"]', '[class*="screenshot"]',
                    '[class*="control"]', '[class*="panel"]',
                    '[class*="modal"]', '[class*="toast"]', '[class*="hint"]',
                    '[class*="extension"]', '[class*="plugin"]',
                    '[class*="preview"]'
                  ];
                  
                  selectors.forEach(selector => {
                    const elementsToHide = clonedDoc.querySelectorAll(selector);
                    elementsToHide.forEach(el => {
                      el.style.display = 'none';
                      el.style.visibility = 'hidden';
                      el.style.opacity = '0';
                    });
                  });
                  
                  const clonedBody = clonedDoc.body;
                  if (clonedBody) {
                    clonedBody.style.backgroundColor = getComputedStyle(document.body).backgroundColor || '#ffffff';
                    
                    const allElements = clonedBody.querySelectorAll('*:not([id*="scroll"]):not([class*="scroll"]):not([class*="extension"]):not([class*="plugin"]):not([class*="preview"])');
                    allElements.forEach(el => {
                      const computedStyle = getComputedStyle(el);
                      if (computedStyle.display === 'none') {
                        el.style.display = 'block';
                      }
                      if (computedStyle.visibility === 'hidden') {
                        el.style.visibility = 'visible';
                      }
                      if (computedStyle.opacity === '0') {
                        el.style.opacity = '1';
                      }
                    });
                  }
                }
              });
              
              // 存储截图数据
              const sectionData = {
                canvas: canvas,
                scrollY: currentScrollY,
                height: viewportHeight,
                timestamp: Date.now()
              };
              
              realtimeState.capturedSections.push(sectionData);
              
              // 更新预览
              updatePreview(sectionData);
              updatePreviewStatus(`已截图 ${realtimeState.capturedSections.length} 个区域`);
              
            } catch (err) {
              console.error('实时截图失败:', err);
              updatePreviewStatus('截图失败，请重试');
            } finally {
              realtimeState.isCapturing = false;
            }
          };
          
          // 更新预览显示
          const updatePreview = (sectionData) => {
            const { canvas, scrollY } = sectionData;
            
            // 显示预览画布
            const placeholder = previewCanvasContainer.querySelector('div');
            if (placeholder) {
              placeholder.style.display = 'none';
            }
            previewCanvas.style.display = 'block';
            
            // 计算预览尺寸
            const previewWidth = 280; // 预览容器宽度
            const scale = previewWidth / canvas.width;
            const previewHeight = canvas.height * scale;
            
            // 设置预览画布尺寸
            if (previewCanvas.width < previewWidth || previewCanvas.height < (previewHeight * realtimeState.capturedSections.length)) {
              previewCanvas.width = previewWidth;
              previewCanvas.height = previewHeight * realtimeState.capturedSections.length;
            }
            
            // 绘制当前截图到预览
            const yPos = (realtimeState.capturedSections.length - 1) * previewHeight;
            realtimeState.previewCtx.drawImage(canvas, 0, yPos, previewWidth, previewHeight);
          };
          
          // 滚动事件监听器
          const scrollHandler = () => {
            const currentScrollY = window.scrollY;
            const scrollDiff = Math.abs(currentScrollY - realtimeState.lastScrollY);
            
            if (scrollDiff > realtimeState.scrollThreshold) {
              realtimeState.lastScrollY = currentScrollY;
              captureVisibleArea();
            }
          };
          
          // ESC键监听
          const keyHandler = (e) => {
            if (e.key === 'Escape') {
              finishRealtimeCapture();
            }
          };
          
          // 完成实时截图
          const finishRealtimeCapture = async () => {
            // 移除事件监听器
            window.removeEventListener('scroll', scrollHandler);
            document.removeEventListener('keydown', keyHandler);
            
            // 移除UI元素
            if (previewContainer.parentNode) {
              previewContainer.parentNode.removeChild(previewContainer);
            }
            
            tipText.textContent = '正在生成最终长截图...';
            
            try {
              if (realtimeState.capturedSections.length === 0) {
                throw new Error('没有捕获到任何截图区域');
              }
              
              // 按滚动位置排序
              realtimeState.capturedSections.sort((a, b) => a.scrollY - b.scrollY);
              
              // 创建最终画布
              const selectedWidth = realtimeState.selectedRect.width;
              const finalHeight = realtimeState.capturedSections[realtimeState.capturedSections.length - 1].scrollY + 
                                 realtimeState.capturedSections[realtimeState.capturedSections.length - 1].height;
              
              const finalCanvas = document.createElement('canvas');
              finalCanvas.width = selectedWidth;
              finalCanvas.height = finalHeight;
              
              const ctx = finalCanvas.getContext('2d');
              
              // 拼接所有截图
              for (const section of realtimeState.capturedSections) {
                const { canvas, scrollY, height } = section;
                const scale = canvas.width / Math.max(
                  document.body.scrollWidth,
                  document.body.offsetWidth,
                  document.documentElement.clientWidth,
                  document.documentElement.scrollWidth,
                  document.documentElement.offsetWidth
                );
                
                const sourceX = realtimeState.selectedRect.left * scale;
                const sourceWidth = realtimeState.selectedRect.width * scale;
                
                if (canvas.width > 0 && canvas.height > 0) {
                  try {
                    ctx.drawImage(
                      canvas,
                      sourceX, 0, sourceWidth, canvas.height,
                      0, scrollY, selectedWidth, height
                    );
                  } catch (drawErr) {
                    console.error('绘制失败:', drawErr);
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, scrollY, selectedWidth, height);
                  }
                }
              }
              
              // 转换并复制
              finalCanvas.toBlob(async (blob) => {
                try {
                  const dataUrl = finalCanvas.toDataURL('image/png');
                  
                  chrome.runtime.sendMessage({
                    action: 'writeToClipboard',
                    dataType: 'image',
                    dataUrl: dataUrl
                  }, async (response) => {
                    if (response && response.success) {
                      showSuccessMessage(selectedWidth, finalHeight);
                    } else {
                      try {
                        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                        showSuccessMessage(selectedWidth, finalHeight);
                      } catch (directError) {
                        console.error('直接写入失败:', directError);
                        showErrorMessage(blob, directError.message);
                      }
                    }
                  });
                } catch (err) {
                  console.error('处理失败:', err);
                  showErrorMessage(null, err.message);
                }
              });
              
              // 显示成功消息
              function showSuccessMessage(width, height) {
                document.body.removeChild(container);
                document.body.removeChild(controlPanel);
                
                const successToast = document.createElement('div');
                successToast.style.cssText = `
                  position: fixed;
                  top: 60px;
                  left: 50%;
                  transform: translateX(-50%);
                  background: #52c41a;
                  color: white;
                  padding: 12px 24px;
                  border-radius: 6px;
                  font-size: 14px;
                  font-weight: 500;
                  z-index: 1000000000;
                  box-shadow: 0 4px 12px rgba(82, 196, 26, 0.3);
                `;
                successToast.textContent = `✅ 实时滚动截图成功 (${Math.round(width)} × ${Math.round(height)} 像素)`;
                document.body.appendChild(successToast);
                
                setTimeout(() => {
                  if (successToast.parentNode) {
                    successToast.parentNode.removeChild(successToast);
                  }
                }, 3000);
              }
              
              // 显示错误消息
              function showErrorMessage(blob, errorMessage) {
                document.body.removeChild(container);
                document.body.removeChild(controlPanel);
                
                const errorToast = document.createElement('div');
                errorToast.style.cssText = `
                  position: fixed;
                  top: 60px;
                  left: 50%;
                  transform: translateX(-50%);
                  background: #ff4d4f;
                  color: white;
                  padding: 12px 24px;
                  border-radius: 6px;
                  font-size: 14px;
                  font-weight: 500;
                  z-index: 1000000000;
                  box-shadow: 0 4px 12px rgba(255, 77, 79, 0.3);
                  text-align: center;
                  max-width: 300px;
                `;
                
                errorToast.innerHTML = `
                  <div>📋 复制到剪贴板失败</div>
                  <div style="font-size: 12px; margin-top: 4px; opacity: 0.9;">${errorMessage}</div>
                  ${blob ? `<button id="downloadBtn" style="
                    margin-top: 8px;
                    padding: 6px 12px;
                    background: white;
                    color: #ff4d4f;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                  ">📥 下载截图</button>` : ''}
                `;
                
                document.body.appendChild(errorToast);
                
                if (blob && document.getElementById('downloadBtn')) {
                  document.getElementById('downloadBtn').onclick = () => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `realtime-screenshot-${new Date().getTime()}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    document.body.removeChild(errorToast);
                  };
                }
                
                setTimeout(() => {
                  if (errorToast.parentNode) {
                    errorToast.parentNode.removeChild(errorToast);
                  }
                }, 5000);
              }
              
            } catch (err) {
              console.error('生成最终截图失败:', err);
              alert('截图失败: ' + err.message);
              
              confirmBtn.disabled = false;
              confirmBtn.textContent = '✅ 确认截图';
              cancelBtn.disabled = false;
              tipText.textContent = '截图失败，请重试';
            }
          };
          
          // 绑定事件
          document.getElementById('finishRealtimeBtn').onclick = finishRealtimeCapture;
          window.addEventListener('scroll', scrollHandler);
          document.addEventListener('keydown', keyHandler);
          
          // 开始实时截图
          updatePreviewStatus('开始滚动以触发截图...');
          realtimeState.lastScrollY = window.scrollY;
        };
        
        // 取消操作
        cancelBtn.onclick = () => {
          document.body.removeChild(container);
          document.body.removeChild(controlPanel);
        };
        
        // 初始状态：禁用确认按钮
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.5';
        confirmBtn.style.cursor = 'not-allowed';
        
        // 添加到页面
        document.body.appendChild(container);
        document.body.appendChild(controlPanel);
      }
    });
  } catch (e) {
    console.error('注入失败:', e);
    show("截图失败");
  }
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
            drawFinderPattern((size/4 - 7) * 4, 0); // 右上
            drawFinderPattern(0, (size/4 - 7) * 4); // 左下
            
            // 随机生成一些数据模块来模拟二维码
            ctx.fillStyle = '#000000';
            for (let y = 2; y < size/4 - 2; y++) {
              for (let x = 2; x < size/4 - 2; x++) {
                // 避开定位标记区域
                if (!((x < 8 && y < 8) || (x > size/4 - 9 && y < 8) || (x < 8 && y > size/4 - 9))) {
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

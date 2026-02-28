// 监听来自content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'captureTab') {
    // 获取当前活动标签页
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        const tab = tabs[0];
        
        // 捕获可见区域
        chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ dataUrl: dataUrl });
          }
        });
        // 返回true表示异步响应
        return true;
      } else {
        sendResponse({ error: 'No active tab found' });
      }
    });
    return true;
  }
  
  // 处理滚动截图数据
  if (message.action === 'processScrollScreenshots') {
    console.log('接收滚动截图数据:', message.data);
    
    // 这里可以实现截图拼接逻辑
    // 由于background script无法直接操作DOM和canvas
    // 需要将数据发送回content script处理
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'processScrollScreenshots',
          data: message.data
        });
      }
    });
    
    sendResponse({ success: true });
    return true;
  }
  
  // 处理剪贴板写入请求
  if (message.action === 'writeToClipboard') {
    console.log('处理剪贴板写入请求');
    
    // 使用扩展的权限写入剪贴板
    if (message.dataType === 'image') {
      if (typeof ClipboardItem === 'undefined') {
        console.error('Background: ClipboardItem 不可用');
        sendResponse({ success: false, error: 'Background: ClipboardItem 不可用' });
      } else {
        fetch(message.dataUrl)
          .then(response => response.blob())
          .then(blob => {
            const clipboardItem = new ClipboardItem({
              'image/png': blob
            });
            
            navigator.clipboard.write([clipboardItem])
              .then(() => {
                console.log('通过扩展权限成功写入剪贴板');
                sendResponse({ success: true });
              })
              .catch(error => {
                console.error('扩展权限写入剪贴板失败:', error);
                sendResponse({ success: false, error: error.message });
              });
          })
          .catch(error => {
            console.error('数据转换失败:', error);
            sendResponse({ success: false, error: error.message });
          });
        
        return true;
      }
    }
  }
});

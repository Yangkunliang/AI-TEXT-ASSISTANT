document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);

  // 页面加载时读取已保存的 Key
  chrome.storage.sync.get(["apiKey"], (res) => {
    $("apiKey").value = res.apiKey || "";
  });

  $("save").onclick = () => {
    const key = $("apiKey").value.trim();
    if (!key) {
      $("status").innerText = "⚠️ API Key 不能为空";
      return;
    }

    chrome.storage.sync.set({ apiKey: key }, () => {
      if (chrome.runtime.lastError) {
        $("status").innerText = "❌ 保存失败：" + chrome.runtime.lastError.message;
      } else {
        $("status").innerText = "✅ 保存成功";
        setTimeout(() => window.close(), 1500);
      }
    });
  };
});
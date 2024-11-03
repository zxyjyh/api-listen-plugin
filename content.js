(function () {
  if (document.querySelector('script[data-ajax-interceptor-zxy]')) {
    console.log('拦截器脚本已存在，跳过注入');
    return;
  }

  console.log('正在注入拦截器脚本');

  var script = document.createElement('script');
  script.setAttribute('data-ajax-interceptor-zxy', 'true');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function () {
    console.log('拦截器脚本加载完成');
    this.remove();


    // 检查 background.js 是否处于监听状态
    // chrome.runtime.sendMessage(
    //   { type: 'ajaxInterceptor', action: 'checkListening' },
    //   (response) => {
    //     if (response.isListening) {
    //       // 通知 injected.js 开始拦截
    //       window.postMessage({
    //         type: 'ajaxInterceptor',
    //         to: 'injectedScript',
    //         action: 'start'
    //       }, '*');
    //       console.log('监听已开启，通知 injected.js 开始拦截');
    //     }
    //   }
    // );




  };
  (document.head || document.documentElement).appendChild(script);
})();


chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  console.log("content.js 收到消息:", request);
  if (request.type === 'ajaxInterceptor' && request.to === 'pageScript') {
    console.log("处理 ajaxInterceptor 消息:", request);
    // to injected.js
    window.postMessage({
      type: 'ajaxInterceptor',
      to: 'injectedScript',
      action: request.action
    }, '*');
    sendResponse({ received: true, status: "处理成功" });
  }
  return true;  // 保持消息通道开放
});

document.addEventListener('ajaxInterceptorReady', function () {
  window.addEventListener("message", function (event) {
    const data = event.data;
    if (data.type === 'ajaxInterceptor' && data.to === 'pageScript') {
      //  to injected.js
      window.postMessage({
        type: 'ajaxInterceptor',
        to: 'injectedScript',
        action: data.action
      }, '*');
    } else if (event.data.type === 'ajaxInterceptor' && event.data.to === 'background' && event.data.action === 'saveData') {
      // to background.js
      chrome.runtime.sendMessage({
        type: 'ajaxInterceptor',
        action: 'saveData',
        url: event.data.url,
        data: event.data.data
      });
    }
  }, false);

  console.log('Ajax 拦截器事件监听器已设置');
});

console.log("content.js 已加载，消息监听器已设置");



if (typeof window.ajaxInterceptorZxyInjected === 'undefined') {
  window.ajaxInterceptorZxyInjected = true;


  (function () {
    if (document.querySelector('script[data-ajax-interceptor-zxy]')) {
      console.log('拦截器脚本已存在，跳过注入');
      return;
    }

    console.log('正在注入拦截器脚本');

    const script = document.createElement('script');
    script.setAttribute('data-ajax-interceptor-zxy', 'true');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = function () {
      console.log('拦截器脚本加载完成');
      this.remove();


      // 检查 background.js 是否处于监听状态
      chrome.runtime.sendMessage(
        { type: 'ajaxInterceptor', action: 'checkListening' },
        (response) => {
          if (response.isListening) {
            // 通知 injected.js 开始拦截
            window.postMessage({
              type: 'ajaxInterceptor',
              to: 'injectedScript',
              action: 'start'
            }, '*');
            console.log('监听已开启，通知 injected.js 开始拦截');
          }else {
            // 通知 injected.js 开始拦截
            window.postMessage({
              type: 'ajaxInterceptor',
              to: 'injectedScript',
              action: 'stop'
            }, '*');
            console.log('监听已取消，通知 injected.js 停止拦截');
          }
        }
      );


    };
    (document.head || document.documentElement).appendChild(script);
  })();

  // 监听来自 background.js 的消息
  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    console.log("content.js 收到消息:", request);
    if (request.type === 'checkInjection') {
      sendResponse({ isInjected: true });
    }

    if (request.type === 'ajaxInterceptor' && request.to === 'pageScript' && request.action) {
      console.log("处理 ajaxInterceptor 消息:", request);
      // 转发给 injected.js
      window.postMessage({
        type: 'ajaxInterceptor',
        to: 'injectedScript',
        action: request.action
      }, '*');
      sendResponse({ received: true, status: "处理成功" });
    }

    return true;  // 保持消息通道开放
  });

  // 监听来自 injected.js 的消息
  window.addEventListener("message", function (event) {
    const data = event.data;
    if (data.type === 'ajaxInterceptor' && data.to === 'background' && data.action === 'saveData') {
      // 转发到 background.js
      chrome.runtime.sendMessage({
        type: 'ajaxInterceptor',
        action: 'saveData',
        url: data.url,
        data: data.data
      }, (response) => {
      });
    }

  }, false);

  console.log("content.js 已加载，消息监听器已设置");

}


window.ajax_interceptor_qoweifjqon_zxy = {
  settings: {
    ajaxInterceptor_switchOn: false,
    interceptDomains: [
      'https://merchant.mykeeta.com/api/order/getOrderDtl',
      'https://uat-manager-gateway.aomiapp.com/aomi-base-info-manager/authres/getResList',
      'https://merchant.openrice.com/api/takeaway/takeawaylist',
      'https://merchant.openrice.com/api/delivery/deliveryorders'
    ],
    interceptedResponses: {},
  },
  originalXHR: window.XMLHttpRequest,
  originalFetch: window.fetch.bind(window),

  isListenDomain: function (url) {
    return window.ajax_interceptor_qoweifjqon_zxy.settings.interceptDomains.some(domain => url.startsWith(domain));
  },

  myXHR: function () {
    const originalXHR = window.ajax_interceptor_qoweifjqon_zxy.originalXHR; // 引用原始XHR
    const xhr = new originalXHR(); // 使用原始XHR构造函数

    // 修改响应的逻辑
    const modifyResponse = () => {
      const url = xhr.responseURL;
      if (window.ajax_interceptor_qoweifjqon_zxy.isListenDomain(url)) {
        console.log('拦截到请求', url);
        console.log('拦截到的数据', xhr.responseText);
        window.ajax_interceptor_qoweifjqon_zxy.settings.interceptedResponses[url] = xhr.responseText;

        // 通知 content.js
        window.postMessage({
          type: 'ajaxInterceptor',
          to: 'background',
          action: 'saveData',
          url: url,
          data: xhr.responseText
        }, '*');
      }
    };

    ['onload'].forEach(prop => {
      const original = xhr[prop];
      xhr[prop] = function (...args) {
        if (window.ajax_interceptor_qoweifjqon_zxy.settings.ajaxInterceptor_switchOn) {
          modifyResponse();
        }
        return original && original.apply(this, args);
      };
    });

    return xhr;
  },

  myFetch: function (...args) {
    return window.ajax_interceptor_qoweifjqon_zxy.originalFetch(...args).then(response => {
      const url = response.url;
      if (window.ajax_interceptor_qoweifjqon_zxy.settings.ajaxInterceptor_switchOn && window.ajax_interceptor_qoweifjqon_zxy.isListenDomain(url)) {
        return response.clone().text().then(text => {
          window.ajax_interceptor_qoweifjqon_zxy.settings.interceptedResponses[url] = text;

          // 通知 content.js
          window.postMessage({
            type: 'ajaxInterceptor',
            to: 'background',
            action: 'saveData',
            url: url,
            data: text
          }, '*');
          return response;
        });
      }
      return response;
    });
  },

  startInterceptor: function () {
    console.log('开始拦截');
    window.ajax_interceptor_qoweifjqon_zxy.settings.ajaxInterceptor_switchOn = true;

    window.XMLHttpRequest = window.ajax_interceptor_qoweifjqon_zxy.myXHR.bind(window.ajax_interceptor_qoweifjqon_zxy);
    window.fetch = window.ajax_interceptor_qoweifjqon_zxy.myFetch.bind(window.ajax_interceptor_qoweifjqon_zxy);
  },

  stopInterceptor: function () {
    console.log('停止拦截');
    window.ajax_interceptor_qoweifjqon_zxy.settings.ajaxInterceptor_switchOn = false;
    window.XMLHttpRequest = window.ajax_interceptor_qoweifjqon_zxy.originalXHR.bind(window.ajax_interceptor_qoweifjqon_zxy);
    window.fetch = window.ajax_interceptor_qoweifjqon_zxy.originalFetch.bind(window.ajax_interceptor_qoweifjqon_zxy);
  },

  clearInterceptedResponses: function () {
    console.log('清除拦截响应');
    window.ajax_interceptor_qoweifjqon_zxy.settings.interceptedResponses = {};
  }
}

// 监听来自 content.js 的消息
window.addEventListener("message", function (event) {
  const data = event.data;
  if (data.type === 'ajaxInterceptor' && data.to === 'injectedScript') {
    if (data.action === 'start') {
      window.ajax_interceptor_qoweifjqon_zxy.startInterceptor();
    } else if (data.action === 'stop') {
      window.ajax_interceptor_qoweifjqon_zxy.stopInterceptor();
    } else if (data.action === 'clear') {
      window.ajax_interceptor_qoweifjqon_zxy.clearInterceptedResponses();
    }
  }
}, false);

// 通知 content.js 脚本已准备就绪
document.dispatchEvent(new Event('ajaxInterceptorReady'));

// 重置 XMLHttpRequest 和 fetch
Object.defineProperty(window, 'XMLHttpRequest', {
  get: function () {
    return window.ajax_interceptor_qoweifjqon_zxy.settings.ajaxInterceptor_switchOn ?
      window.ajax_interceptor_qoweifjqon_zxy.myXHR.bind(window.ajax_interceptor_qoweifjqon_zxy) :
      window.ajax_interceptor_qoweifjqon_zxy.originalXHR;
  }
});

Object.defineProperty(window, 'fetch', {
  get: function () {
    return window.ajax_interceptor_qoweifjqon_zxy.settings.ajaxInterceptor_switchOn ?
      window.ajax_interceptor_qoweifjqon_zxy.myFetch.bind(window.ajax_interceptor_qoweifjqon_zxy) :
      window.ajax_interceptor_qoweifjqon_zxy.originalFetch;
  }
});

console.log('injected.js 执行完毕');
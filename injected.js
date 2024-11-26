(function () {
  const OriginalXMLHttpRequest = window.XMLHttpRequest;

  window.ajax_interceptor_qoweifjqon_zxy = {
    settings: {
      ajaxInterceptor_switchOn: false,
      interceptDomains: [
        // 'https://merchant.mykeeta.com/api/order/getOrderDtl',
        'https://merchant.openrice.com/api/takeaway/takeawaylist',
        // 'https://merchant.openrice.com/api/delivery/deliveryorders',
        'https://merchant.mykeeta.com/api/order/history/getOrders',
        'https://vagw-api.ap.prd.portal.restaurant/query',
        'https://restaurant-hub-data-api.deliveroo.net/api/orders',
        'https://restaurant-hub-data-api.deliveroo.net/api/insights/refunds/'
      ],
      interceptedResponses: {},
    },
    originalXHR: OriginalXMLHttpRequest,
    originalFetch: window.fetch.bind(window),

    isListenDomain: function (url) {
      return window.ajax_interceptor_qoweifjqon_zxy.settings.interceptDomains.some(domain => url.startsWith(domain));
    },

    myXHR: function () {
      const xhr = new OriginalXMLHttpRequest()

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


      xhr.addEventListener('load', function (...args) {
        if (window.ajax_interceptor_qoweifjqon_zxy.settings.ajaxInterceptor_switchOn) {
          modifyResponse();
        }

        // 如果原始的 onload 存在，则调用它
        if (typeof xhr.onload === 'function') {
          xhr.onload.apply(this, args);
        }
      });


      // ['onload'].forEach(prop => {
      //   const original = xhr[prop];
      //   xhr[prop] = function (...args) {
      //     if (window.ajax_interceptor_qoweifjqon_zxy.settings.ajaxInterceptor_switchOn) {
      //       modifyResponse();
      //     }
      //     return original && original.apply(this, args);
      //   };
      // });

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
      ajax_interceptor_qoweifjqon_zxy.settings.ajaxInterceptor_switchOn = true;
      // 获取当前页面的地址
      const u = new URL(location.href)
      if (u.hostname !== 'partner-hub.deliveroo.com') {
        window.XMLHttpRequest = ajax_interceptor_qoweifjqon_zxy.myXHR.bind(ajax_interceptor_qoweifjqon_zxy);
      } else {
        window.XMLHttpRequest = OriginalXMLHttpRequest
      }

      window.fetch = new Proxy(window.fetch, {
        apply: (target, thisArg, args) => {
          const url = args[0];
          if (ajax_interceptor_qoweifjqon_zxy.settings.ajaxInterceptor_switchOn && ajax_interceptor_qoweifjqon_zxy.isListenDomain(url)) {
            return target.apply(thisArg, args).then(response => {
              return response.clone().text().then(text => {
                // 拦截并保存响应数据
                ajax_interceptor_qoweifjqon_zxy.settings.interceptedResponses[url] = text;

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
            });
          }
          return target.apply(thisArg, args);
        }
      });
    },

    stopInterceptor: function () {
      console.log('停止拦截');
      ajax_interceptor_qoweifjqon_zxy.settings.ajaxInterceptor_switchOn = false;
      window.fetch = ajax_interceptor_qoweifjqon_zxy.originalFetch;
      window.XMLHttpRequest = ajax_interceptor_qoweifjqon_zxy.originalXHR;
    },

    clearInterceptedResponses: function () {
      console.log('清除拦截响应');
      ajax_interceptor_qoweifjqon_zxy.settings.interceptedResponses = {};
    }
  }

  // 监听来自 content.js 的消息
  window.addEventListener("message", function (event) {
    const data = event.data;
    if (data.type === 'ajaxInterceptor' && data.to === 'injectedScript') {
      if (data.action === 'start') {
        ajax_interceptor_qoweifjqon_zxy.startInterceptor();
      } else if (data.action === 'stop') {
        ajax_interceptor_qoweifjqon_zxy.stopInterceptor();
      } else if (data.action === 'clear') {
        ajax_interceptor_qoweifjqon_zxy.clearInterceptedResponses();
      }
    }
  }, false);

  // 通知 content.js 脚本已准备就绪
  document.dispatchEvent(new Event('ajaxInterceptorReady'));



  // 使用动态 `getter` 设置 `XMLHttpRequest` 和 `fetch`
  // Object.defineProperty(window, 'XMLHttpRequest', {
  //   get: function () {
  //     return ajax_interceptor_qoweifjqon_zxy.settings.ajaxInterceptor_switchOn ?
  //       ajax_interceptor_qoweifjqon_zxy.myXHR.bind(ajax_interceptor_qoweifjqon_zxy) :
  //       ajax_interceptor_qoweifjqon_zxy.originalXHR;
  //   }
  // });

  const u = new URL(location.href)
  if (u.hostname === 'partner.foodpanda.com') {
    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.addedNodes) {
          mutation.addedNodes.forEach((node) => {
            if (node.tagName === "SCRIPT" && node.src.includes("portalPluginOrders__Module")) {

              node.addEventListener("load", () => {
                window.fetch = ajax_interceptor_qoweifjqon_zxy.settings.ajaxInterceptor_switchOn ?
                  ajax_interceptor_qoweifjqon_zxy.myFetch :
                  ajax_interceptor_qoweifjqon_zxy.originalFetch;
              });
            }
          });
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    Object.defineProperty(window, 'fetch', {
      get: function () {
        return ajax_interceptor_qoweifjqon_zxy.settings.ajaxInterceptor_switchOn ?
          ajax_interceptor_qoweifjqon_zxy.myFetch :
          ajax_interceptor_qoweifjqon_zxy.originalFetch;
      }
    });
  }


  console.log('injected.js 执行完毕');
})()
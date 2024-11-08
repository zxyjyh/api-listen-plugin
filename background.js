
importScripts('libs/xlsx.full.min.js');

console.log("background.js 运行");

chrome.runtime.onInstalled.addListener(() => {
  console.log("扩展已安装");
});
// chrome.action.onClicked.addListener(() => {
//   console.log("扩展图标点击，Service Worker 启动");
// });

let isListening = false;

chrome.storage.local.get(['isListening'], (result) => {
  isListening = result && result.isListening || false;
  console.log("初始状态:", isListening);
  chrome.storage.local.set({ "isListening": isListening });
});

const dbName = "APIInterceptorDB";
const storeName = "apiDataStore";
let db;

const interceptDomains = [
  "https://merchant.mykeeta.com",
  "https://merchant.openrice.com",
  "https://partner.foodpanda.com",
  "https://partner-hub.deliveroo.com"
]
const apiDomains = [
  'https://merchant.openrice.com/api/takeaway/takeawaylist',
  'https://merchant.mykeeta.com/api/order/history/getOrders',
  'https://vagw-api.ap.prd.portal.restaurant/query',
  'https://restaurant-hub-data-api.deliveroo.net/api/orders',
]

const isDomain = (url) => {
  return interceptDomains.some(domain => url.startsWith(domain))
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);

    request.onerror = () => {
      console.error("IndexedDB 打开失败");
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "timestamp" });
      }
    };
  });
}

function saveToDatabase(data, type) {
  return openDatabase().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      console.log('Key path:', store.keyPath); // 显示主键字段
      console.log('Auto increment:', store.autoIncrement); // 是否自增
      let requests = [];

      if (type === 'arr') {
        data.forEach(item => {
          const request = store.add(item);
          requests.push(request);
        });
      } else {
        const request = store.add(data);
        requests.push(request);
      }

      let successCount = 0;
      let errorOccurred = false;

      requests.forEach(request => {
        request.onsuccess = () => {
          successCount++;
          if (successCount === requests.length && !errorOccurred) {
            console.log("所有数据已成功保存到 IndexedDB");
            resolve();
          }
        };

        request.onerror = () => {
          if (!errorOccurred) {
            console.error("保存数据到 IndexedDB 时出错:", request.error);
            errorOccurred = true;
            reject(request.error);
          }
        };
      });
    });
  });
}

function getDataFromDatabase() {
  return openDatabase().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error("从 IndexedDB 获取数据时出错:", request.error);
        reject(request.error);
      };
    });
  });
}

function clearDatabase() {
  return openDatabase().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => {
        console.log("IndexedDB 数据已成功清除");
        resolve();
      };

      request.onerror = () => {
        console.error("清除 IndexedDB 数据时出错:", request.error);
        reject(request.error);
      };
    });
  });
}

// 监听来自 popup 和 content.js的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "start") {
    startListening();
  } else if (message.action === "stop") {
    stopListening();
  } else if (message.action === "export") {
    exportData();
  } else if (message.action === "clearData") {
    clearDatabase()
  } else if (message.type === 'ajaxInterceptor' && message.action === 'saveData') {
    saveData(message.url, message.data);
  } else if (message.type === 'ajaxInterceptor' && message.action === 'checkListening') {
    sendResponse({ isListening });
  }
  return true
});

function startListening() {
  if (isListening) return;

  isListening = true;
  console.log("Listening for API requests...");

  // 通知所有的tab
  chrome.tabs.query({}, function (tabs) {
    tabs.forEach(tab => {
      if (tab.url && isDomain(tab.url)) {
        // 向每個標籤頁發送檢查注入狀態的消息
        chrome.tabs.sendMessage(tab.id, { type: 'checkInjection' }, response => {
          if (chrome.runtime.lastError || !response || !response.isInjected) {
            // 只有當 content.js 未被注入時才注入
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js']
            }, () => {
              // 注入完成後發送 start 消息
              chrome.tabs.sendMessage(tab.id, {
                type: 'ajaxInterceptor',
                to: 'pageScript',
                action: 'start'
              }, response => {
                if (chrome.runtime.lastError) {
                  console.warn(`無法向標籤頁 ${tab.id} 發送消息: `, chrome.runtime.lastError.message);
                } else {
                  console.log(`已通知標籤頁 ${tab.id} 開始監聽 (注入後)`);
                }
              });
            });
          } else {
            // 直接發送 start 消息
            chrome.tabs.sendMessage(tab.id, {
              type: 'ajaxInterceptor',
              to: 'pageScript',
              action: 'start'
            }, response => {
              if (chrome.runtime.lastError) {
                console.warn(`無法向標籤頁 ${tab.id} 發送消息: `, chrome.runtime.lastError.message);
              } else {
                console.log(`已通知標籤頁 ${tab.id} 開始監聽 (已注入)`);
              }
            });
          }
        });
      }
    });
  });

  // 只通知當前激活的標籤頁
  // chrome.windows.getCurrent({ populate: true }, function (window) {
  //   const activeTab = window.tabs.find(tab => tab.active);
  //   chrome.tabs.sendMessage(activeTab.id, {
  //     type: 'ajaxInterceptor',
  //     to: 'pageScript',
  //     action: 'start'
  //   }, response => {
  //     if (chrome.runtime.lastError) {
  //       console.warn(`無法向標籤頁 ${activeTab.id} 發送消息: `, chrome.runtime.lastError.message);
  //     } else {
  //       console.log(`已通知標籤頁 ${activeTab.id} 開始監聽`);
  //     }
  //   });
  // });
}

function stopListening() {
  if (!isListening) return;

  isListening = false;
  console.log("Stopped listening for API requests.");

  // 通知所有的tab
  chrome.tabs.query({}, function (tabs) {
    tabs.forEach(tab => {
      if (tab.url && isDomain(tab.url)) {
        // 向每個標籤頁發送檢查注入狀態的消息
        chrome.tabs.sendMessage(tab.id, { type: 'checkInjection' }, response => {
          if (chrome.runtime.lastError || !response || !response.isInjected) {
            // 只有當 content.js 未被注入時才注入
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js']
            }, () => {
              // 注入完成後發送 stop 消息
              chrome.tabs.sendMessage(tab.id, {
                type: 'ajaxInterceptor',
                to: 'pageScript',
                action: 'stop'
              }, response => {
                if (chrome.runtime.lastError) {
                  console.warn(`無法向標籤頁 ${tab.id} 發送消息: `, chrome.runtime.lastError.message);
                } else {
                  console.log(`已通知標籤頁 ${tab.id} 停止监听`);
                }
              });
            });
          } else {
            // 直接發送 start 消息
            chrome.tabs.sendMessage(tab.id, {
              type: 'ajaxInterceptor',
              to: 'pageScript',
              action: 'stop'
            }, response => {
              if (chrome.runtime.lastError) {
                console.warn(`無法向標籤頁 ${tab.id} 發送消息: `, chrome.runtime.lastError.message);
              } else {
                console.log(`已通知標籤頁 ${tab.id} 停止监听`);
              }
            });
          }
        });
      }
    });
  });

  // 只通知當前激活的tab
  // chrome.windows.getCurrent({ populate: true }, function (window) {
  //   var activeTab = window.tabs.find(tab => tab.active);
  //   chrome.tabs.sendMessage(activeTab.id, {
  //     type: 'ajaxInterceptor',
  //     to: 'pageScript',
  //     action: 'stop'
  //   }, response => {
  //     if (chrome.runtime.lastError) {
  //       console.warn(`無法向標籤頁 ${activeTab.id} 發送消息: `, chrome.runtime.lastError.message);
  //     } else {
  //       console.log(`已通知標籤頁 ${activeTab.id} 開始監聽`);
  //     }
  //   });
  // });
}

function handleApiData(url, data) {
  const value = JSON.parse(data)
  // 时间戳转成东八区时间 2024-11-06 00:00:00
  const getDateTime = (val) => {
    const date = new Date(val)
    date.setHours(date.getHours() + 8)
    return date.toISOString().replace('T', ' ').substring(0, 19)
  }


  const centToYuan = (val) => {
    return (val / 100).toFixed(2)
  }

  if (url.startsWith('https://merchant.mykeeta.com')) {
    // keeta
    const orderInfos = value.data && value.data.list && value.data.list.filter(el => el.merchantOrder.status === 40).map((el, idx) => {
      return {
        url,
        timestamp: new Date().toISOString() + idx,
        platform: 'keeta',
        seqNo: el.merchantOrder.userGetMode === 'pickup' ? `PU${el.merchantOrder.seqNo}` : el.merchantOrder.seqNo,/////取餐号
        status: el.merchantOrder.status === 40 ? '已完成' : '未完成',///订单状态
        orderViewId: String(el.merchantOrder.orderViewId),///订单号
        shopId: el.merchantOrder.shopId, ///门店id
        shopName: el.merchantOrder.shopName,///门店名称
        unconfirmedStatusTime: getDateTime(el.merchantOrder.unconfirmedStatusTime),///顾客下单时间
        confirmedStatusTime: getDateTime(el.merchantOrder.confirmedStatusTime),///商家接单时间
        readiedStatusTime: getDateTime(el.merchantOrder.readiedStatusTime),///商家出餐时间
        completedStatusTime: getDateTime(el.merchantOrder.completedStatusTime),///订单送达时间
        products: el.products.map(item => {
          return {
            count: item.count,
            originPrice: centToYuan(item.originPrice),
            name: item.name,
            price: centToYuan(item.price),
            groups: item.groups.map(group => {
              return {
                name: group.shopProductGroupSkuList[0].spuName,
                price: centToYuan(group.shopProductGroupSkuList[0].price),
                originPrice: centToYuan(group.shopProductGroupSkuList[0].price),
                count: group.shopProductGroupSkuList[0].count,
                groupSkuCount: group.shopProductGroupSkuList[0].groupSkuCount
              }
            })
          }
        }),//商品信息
        brokerage: centToYuan(el.feeDtl.merchantFee.brokerage), ///佣金
        activityFee: centToYuan(el.feeDtl.merchantFee.activityFee), ///商家承擔活動費用
        total: centToYuan(el.feeDtl.merchantFee.total), ///預計收入
        diffPrice: centToYuan(el.feeDtl.merchantFee.diffPrice), ///最低消費金額補差價
        productPrice: centToYuan(el.feeDtl.customerFee.productPrice), ///菜品總價
        shippingFee: centToYuan(el.feeDtl.customerFee.shippingFee), ///配送費
        platformFee: centToYuan(el.feeDtl.customerFee.platformFee), ///平臺費
        discounts: centToYuan(el.feeDtl.customerFee.discounts), ///優惠金額
        actTotal: centToYuan(el.feeDtl.customerFee.actTotal), ///顧客實際支付
        deliveryOrderType: el.merchantOrder.userGetMode === 'pickup' ? '自取' : '外送', ///配送類型
        remark: el.merchantOrder.remark, ///備註
      }
    })

    return orderInfos
  } else if (url.startsWith('https://merchant.openrice.com')) {
    // openrice
    const orderInfos = value.data && value.data && value.data.filter(el => el.status === 10).map((el, idx) => {
      return {
        url,
        timestamp: new Date().toISOString() + idx,
        platform: 'openrice',
        seqNo: el.pickupNumber,/////取餐號
        status: el.status === 10 ? '已完成' : '未完成',///訂單狀態
        orderViewId: el.orderRefId,///訂單號
        shopId: el.orPoiId, ///門店id
        shopName: el.poiName,///門店名稱
        unconfirmedStatusTime: getDateTime(el.createTime),///顧客下單時間
        confirmedStatusTime: '',///商家接單時間
        readiedStatusTime: getDateTime(el.pickupTime),///商家出餐時間
        completedStatusTime: getDateTime(el.completedTime),///訂單送達時間
        products: el.takeAwayOrderItems.map(product => {
          return {
            count: product.quantity,
            originPrice: product.unitPrice,
            name: product.name,
            price: product.unitPrice,
            groups: product.comboItems.map(group => {
              return {
                count: group.quantity,
                originPrice: group.unitPrice,
                name: group.name,
                price: group.unitPrice,
              }
            })
          }
        }),//商品信息
        brokerage: el.commissionCharge, ///佣金
        activityFee: '', ///商家承擔活動費用
        total: el.netTotalAmount, ///預計收入
        diffPrice: '', ///最低消費金額補差價
        productPrice: el.merchantFinalPrice, ///菜品總價
        shippingFee: '', ///運費
        platformFee: '', ///平臺費
        discounts: '', ///優惠金額
        actTotal: '', ///顧客實際支付
        deliveryOrderType: el.deliveryOrderType, ///訂單類型
        remark: el.remark, ///備註
      }
    })

    return orderInfos
  } else if (url.startsWith('https://vagw-api.ap.prd.portal.restaurant/query') && value.data.orders && value.data.orders.order && value.data.orders.order.order && value.data.orders.order.order.status === 'DELIVERED') {
    // foodpanda
    const orderData = value.data.orders.order
    const getStatusTime = (val) => {
      const status = orderData.orderStatuses.find(el => el.status === val)
      if (status && status.timestamp) {
        return getDateTime(status.timestamp)
      }
      return ''
    }
    return {
      url,
      timestamp: new Date().toISOString(),
      platform: 'foodpanda',
      seqNo: '',///取餐号
      status: orderData.order.status ==='DELIVERED'?'已完成':'未完成',///订单状态
      orderViewId: orderData.order.orderId,///订单号
      shopId: orderData.order.vendorId, ///门店id
      shopName: orderData.order.vendorName,///门店名称
      unconfirmedStatusTime: getStatusTime('SENDING_TO_VENDOR'),///顾客下单时间
      confirmedStatusTime: getStatusTime('ACCEPTED'),///商家接单时间
      readiedStatusTime: getStatusTime('ORDER_PREPARED'),///商家出餐时间
      completedStatusTime: getStatusTime('DELIVERED'),///订单送达时间
      products: orderData.order.items && orderData.order.items.map(product => {
        return {
          count: product.quantity,
          originPrice: product.unitPrice,
          name: product.parentName !== product.name ? `${product.parentName}(${product.name})` : product.name,
          price: product.unitPrice,
          groups: product.options && product.options.map(group => {
            return {
              count: group.quantity,
              originPrice: group.unitPrice,
              name: group.name,
              price: group.unitPrice,
            }
          })
        }
      }),//商品信息
      brokerage: '', ///佣金
      activityFee: '', ///商家承擔活動費用
      total: '', ///預計收入
      diffPrice: '', ///最低消費金額補差價
      productPrice: orderData.order.orderValue, ///菜品總價
      shippingFee: '', ///配送費
      platformFee: '', ///平臺費
      discounts: '', ///優惠金額
      actTotal: orderData.order.orderValue, ///顧客實際支付
      deliveryOrderType: orderData.order.devlivery.provider==='pickup'?'自取':'配送', ///配送類型
      remark: '', ///備註
    }
  } else if (url.startsWith('https://restaurant-hub-data-api.deliveroo.net/api/orders')) {
    // deliveroo
    return {
      url,
      timestamp: new Date().toISOString(),
      platform: 'deliveroo',
      seqNo: '',///取餐号
      status: '已完成',///订单状态
      orderViewId: value.order_number,///订单号
      shopId: '', ///门店id
      shopName: '',///门店名称
      unconfirmedStatusTime: getDateTime(value.timeline.placed_at),///顾客下单时间
      confirmedStatusTime: getDateTime(value.timeline.accepted_at),///商家接单时间
      readiedStatusTime: getDateTime(value.timeline.prepare_for),///商家出餐时间
      completedStatusTime: value.timeline.delivery_picked_up_at ? getDateTime(value.timeline.delivery_picked_up_at) : '',///订单送达时间
      products: value.items.map(product => {
        return {
          count: product.quantity,
          originPrice: centToYuan(product.unit_price.fractional),
          name: product.name,
          price: centToYuan(product.unit_price.fractional),
          groups: product.modifiers.length && product.modifiers.map(group => {
            return {
              count: product.quantity,
              originPrice: '',
              name: group.name,
              price: '',
            }
          })
        }
      }),///商品信息
      brokerage: '', ///佣金
      activityFee: '', ///商家承擔活動費用
      total: '', ///預計收入
      diffPrice: '', ///最低消費金額補差價
      productPrice: centToYuan(value.amount.fractional), ///菜品總價
      shippingFee: '', ///配送費
      platformFee: '', ///平臺費
      discounts: '', ///優惠金額
      actTotal: centToYuan(value.amount.fractional), ///顧客實際支付
      deliveryOrderType: value.status === 'delivered' ? '配送' : '自取', ///配送類型
      remark: '', ///備註
    }
  }
}

function saveData(url, data) {
  if (!isListening) return;

  // 添加新的數據
  const apiData = handleApiData(url, data)

  if (url.startsWith('https://vagw-api.ap.prd.portal.restaurant/query') || url.startsWith('https://restaurant-hub-data-api.deliveroo.net/api/orders')) {
    saveToDatabase(apiData).catch((error) => {
      console.error("保存數據到 IndexedDB 時出錯:", error);
    });
  } else {
    saveToDatabase(apiData, 'arr').catch((error) => {
      console.error("保存數據到 IndexedDB 時出錯:", error);
    });
  }
}


function filterData(arr) {
  const seen = new Set();
  const uniqueArr = arr.filter(item => {
    if (!seen.has(item.orderViewId)) {
      seen.add(item.orderViewId);
      return true;
    }
    return false;
  });
  return uniqueArr
}

function exportData() {
  getDataFromDatabase()
    .then(data => {

      const uniqueData = filterData(data)


      const worksheetData1 = [
        ...uniqueData.map(item => {
          return {
            '平台': item.platform,
            '門店': item.shopName,
            '門店ID': item.shopId,
            '取餐號': item.seqNo,
            '訂單號': item.orderViewId,
            '訂單狀態': item.status,
            '配送類型': item.deliveryOrderType,
            '下單時間': item.unconfirmedStatusTime,
            '出餐時間': item.readiedStatusTime,
            '送達時間': item.completedStatusTime,
            "餐點總價": item.productPrice,
            "佣金": item.brokerage,
            "商家承擔活動費用": item.activityFee,
            "與最低消費的差價": item.diffPrice,
            "預計收入": item.total,
            "顧客實付": item.actTotal,
            "運費": item.shippingFee,
            "平台服務費": item.platformFee,
            "優惠": item.discounts,
            "貼士": item.remark
          }
        })
      ];


      let worksheetData2 = []
      for (const item of uniqueData) {
        if (item.products.length) {
          for (const product of item.products) {
            worksheetData2.push({
              '平台': item.platform,
              '門店': item.shopName,
              '門店ID': item.shopId,
              '訂單號': item.orderViewId,
              '訂單狀態': item.status,
              "商品類型": '商品',
              '商品名稱': product.name,
              '商品數量': product.count,
              "成交價": product.price,
              '劃線價': product.originPrice,
            })

            if (product.groups && product.groups.length) {
              for (const group of product.groups) {
                worksheetData2.push({
                  '平台': item.platform,
                  '門店': item.shopName,
                  '門店ID': item.shopId,
                  '訂單號': item.orderViewId,
                  '訂單狀態': item.status,
                  "商品類型": 'group',
                  '商品名稱': group.name,
                  '商品數量': group.count,
                  "成交價": group.price,
                  '劃線價': group.originPrice,
                })
              }
            }
          }
        }

      }

      const workbook = XLSX.utils.book_new();
      const worksheet1 = XLSX.utils.json_to_sheet(worksheetData1);
      const worksheet2 = XLSX.utils.json_to_sheet(worksheetData2);
      XLSX.utils.book_append_sheet(workbook, worksheet1, "訂單表");
      XLSX.utils.book_append_sheet(workbook, worksheet2, "商品表");

      const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

      // 使用 FileReader 將 Blob 轉換成 Base64 URL
      const reader = new FileReader();
      reader.onloadend = function () {
        const base64data = reader.result;
        chrome.downloads.download({
          url: base64data,
          filename: 'api_data.xlsx',
          saveAs: true
        });

        clearDatabase()
      };
      reader.readAsDataURL(blob);
    })
    .catch(error => {
      console.error("從 IndexedDB 獲取數據時出錯:", error);
    });
}






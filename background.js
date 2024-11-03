
importScripts('libs/xlsx.full.min.js');

let isListening = false;

// 初始化 IndexedDB
const dbName = "APIInterceptorDB";
const storeName = "apiDataStore";
let db;

const interceptDomains = [
  'https://merchant.mykeeta.com/api/order/getOrderDtl',
  'https://uat-manager-gateway.aomiapp.com/aomi-base-info-manager/authres/getResList',
  'https://merchant.openrice.com/api/takeaway/takeawaylist'
]

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

function saveToDatabase(data) {
  return openDatabase().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.add(data);

      request.onsuccess = () => {
        console.log("数据已成功保存到 IndexedDB");
        resolve();
      };

      request.onerror = () => {
        console.error("保存数据到 IndexedDB 时出错:", request.error);
        reject(request.error);
      };
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
  } else if (message.type === 'ajaxInterceptor' && message.action === 'saveData') {
    saveData(message.url, message.data);
  } else if (message.type === 'ajaxInterceptor' && message.action === 'checkListening') {
    sendResponse({ isListening });
  }
});

function startListening() {
  if (isListening) return;

  isListening = true;
  console.log("Listening for API requests...");

  // 查询所有标签页
  chrome.tabs.query({}, function (tabs) {
    tabs.forEach(tab => {
      if (tab.url && tab.url.startsWith('http')) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }, () => {
          // 向每个标签页发送消息
          chrome.tabs.sendMessage(tab.id, {
            type: 'ajaxInterceptor',
            to: 'pageScript',
            action: 'start'
          }, response => {
            if (chrome.runtime.lastError) {
              console.warn(`无法向标签页 ${tab.id} 发送消息: `, chrome.runtime.lastError.message);
            } else {
              console.log(`已通知标签页 ${tab.id} 开始监听`);
            }
          });
        })
      }

    });
  });

  // chrome.windows.getCurrent({ populate: true }, function (window) {
  //   var activeTab = window.tabs.find(tab => tab.active);
  //   chrome.tabs.sendMessage(activeTab.id, {
  //     type: 'ajaxInterceptor',
  //     to: 'pageScript',
  //     action: 'start'
  //   });
  // });
}

function stopListening() {
  if (!isListening) return;

  isListening = false;
  console.log("Stopped listening for API requests.");

  // 查询所有标签页
  chrome.tabs.query({}, function (tabs) {
    console.log(tabs, 'tabs_______')
    tabs.forEach(tab => {
      // 先检查标签页的 URL，确保是符合条件的页面（如非 Chrome 内部页面）
      if (tab.url && tab.url.startsWith('http')) {
        // 尝试注入 content.js 确保内容脚本已存在
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }, () => {
          // 注入完成后发送停止监听的消息
          chrome.tabs.sendMessage(tab.id, {
            type: 'ajaxInterceptor',
            to: 'pageScript',
            action: 'stop'
          }, response => {
            if (chrome.runtime.lastError) {
              console.warn(`无法向标签页 ${tab.id} 发送消息: `, chrome.runtime.lastError.message);
            } else {
              console.log(`已通知标签页 ${tab.id} 停止监听`);
            }
          });
        });
      }
    });
  });

  // chrome.windows.getCurrent({ populate: true }, function (window) {
  //   var activeTab = window.tabs.find(tab => tab.active);
  //   chrome.tabs.sendMessage(activeTab.id, {
  //     type: 'ajaxInterceptor',
  //     to: 'pageScript',
  //     action: 'stop'
  //   });
  // });
}

function handleApiData(url, data) {
  const value = JSON.parse(data)
  let clearData = {}
  if (url.startsWith('https://merchant.mykeeta.com')) {
    clearData = {
      platform: 'keeta',
      seqNo: value.data.orderInfo.merchantOrder.seqNo,/////取餐号
      status: value.data.orderInfo.merchantOrder.status,///订单状态
      orderViewId: value.data.orderInfo.merchantOrder.orderViewId,///订单号
      shopId: value.data.orderInfo.merchantOrder.shopId, ///门店id
      shopName: value.data.orderInfo.merchantOrder.shopName,///门店名称
      unconfirmedStatusTime: value.data.orderInfo.merchantOrder.unconfirmedStatusTime,///顾客下单时间
      confirmedStatusTime: value.data.orderInfo.merchantOrder.confirmedStatusTime,///商家接单时间
      readiedStatusTime: value.data.orderInfo.merchantOrder.readiedStatusTime,///商家出餐时间
      completedStatusTime: value.data.orderInfo.merchantOrder.completedStatusTime,///订单送达时间
      products: value.data.orderInfo.products.map(item => {
        return {
          count: item.count,
          originPrice: item.originPrice,
          name: item.name,
          price: item.price,
          groups: item.groups.map(group => {
            return {
              spuName: group.shopProductGroupSkuList[0].spuName,
              price: group.shopProductGroupSkuList[0].price,
              count: group.shopProductGroupSkuList[0].count,
              groupSkuCount: group.shopProductGroupSkuList[0].groupSkuCount
            }
          })
        }
      }),//商品信息
      brokerage: value.data.orderInfo.feeDtl.merchantFee.brokerage, ///佣金
      activityFee: value.data.orderInfo.feeDtl.merchantFee.activityFee, ///商家承担活动费用
      total: value.data.orderInfo.feeDtl.merchantFee.total, ///预计收入
      diffPrice: value.data.orderInfo.feeDtl.merchantFee.diffPrice, ///最低消费金额补差价
      productPrice: value.data.orderInfo.feeDtl.customerFee.productPrice, ///菜品总价
      shippingFee: value.data.orderInfo.feeDtl.customerFee.shippingFee, ///配送费
      platformFee: value.data.orderInfo.feeDtl.customerFee.platformFee, ///平台费
      discounts: value.data.orderInfo.feeDtl.customerFee.discounts, ///优惠金额
      actTotal: value.data.orderInfo.feeDtl.customerFee.actTotal, ///顾客实际支付
      timestamp: new Date().toISOString()
    }
  } else if (url.startsWith('https://merchant.openrice.com')) {
    clearData = {
      platform: 'openrice',
    }
  }


  return {
    url,
    data: JSON.stringify(clearData),
    timestamp: new Date().toISOString()
  }
}

function saveData(url, data) {
  if (!isListening) return;

  // 添加新的数据
  const apiData = handleApiData(url, data)

  // 使用 IndexedDB 保存数据
  saveToDatabase(apiData).catch((error) => {
    console.error("保存数据到 IndexedDB 时出错:", error);
  });
}

function exportData() {
  getDataFromDatabase()
    .then(data => {
      console.log(data, 'data_____')
      const worksheetData1 = [
        ...data.map(item => {
          const parseData = JSON.parse(item.data)
          return {
            '平台': parseData.platform,
            '门店': parseData.shopName,
            '门店ID': parseData.shopId,
            '取餐号': parseData.seqNo,
            '订单号': parseData.orderViewId,
            '订单状态': parseData.status,
            '配送类型': '',
            '下单时间': parseData.unconfirmedStatusTime,
            '出餐时间': parseData.readiedStatusTime,
            '送达时间': parseData.completedStatusTime,
            "餐点总价": parseData.productPrice,
            "佣金": parseData.brokerage,
            "商家承担活动费用": parseData.activityFee,
            "最低消费金额补差价": parseData.diffPrice,
            "预计收入": parseData.total,
            "配送费": parseData.shippingFee,
            "平台费": parseData.platformFee,
            "优惠金额": parseData.discounts,
            "顾客实际支付": parseData.actTotal
          }
        })
      ];


      let worksheetData2 = []
      for (const item of data) {
        const parseData = JSON.parse(item.data)
        console.log(parseData, 'parseData_____')

        if (parseData.products.length) {
          for (const product of parseData.products) {
            worksheetData2.push({
              '平台': parseData.platform,
              '门店': parseData.shopName,
              '门店ID': parseData.shopId,
              '订单号': parseData.orderViewId,
              '订单状态': parseData.status,
              "商品类型": '商品',
              '商品名称': product.name,
              '商品数量': product.count,
              '商品划线价': product.originPrice,
              "商品价格": product.price
            })

            if (product.groups.length) {
              for (const group of product.groups) {
                worksheetData2.push({
                  '平台': parseData.platform,
                  '门店': parseData.shopName,
                  '门店ID': parseData.shopId,
                  '订单号': parseData.orderViewId,
                  '订单状态': parseData.status,
                  "商品类型": 'group',
                  '商品名称': group.spuName,
                  '商品数量': group.count,
                  '商品划线价': group.originPrice,
                  "商品价格": group.price
                })
              }
            }
          }
        }

      }

      const workbook = XLSX.utils.book_new();
      const worksheet1 = XLSX.utils.json_to_sheet(worksheetData1);
      const worksheet2 = XLSX.utils.json_to_sheet(worksheetData2);
      XLSX.utils.book_append_sheet(workbook, worksheet1, "订单表");
      XLSX.utils.book_append_sheet(workbook, worksheet2, "商品表");

      const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

      // 使用 FileReader 将 Blob 转换成 Base64 URL
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
      console.error("从 IndexedDB 获取数据时出错:", error);
    });
}


// chrome.tabs.onActivated.addListener((activeInfo) => {
//   chrome.tabs.get(activeInfo.tabId, (tab) => {
//     if (tab.url && tab.url.startsWith('http')) {
//       chrome.tabs.executeScript(tab.id, {file: 'content.js'});
//     }
//   });
// });
// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//   if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
//     chrome.tabs.executeScript(tabId, {file: 'content.js'});
//   }
// });




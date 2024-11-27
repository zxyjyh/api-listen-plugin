
importScripts('libs/xlsx.full.min.js');

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
      const db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 创建对象存储
      if (!db.objectStoreNames.contains(storeName)) {
        const store = db.createObjectStore(storeName, { keyPath: "timestamp" });

        // 创建索引
        store.createIndex("platform", "platform", { unique: false });
        store.createIndex("request_id", "request_id", { unique: false });
        store.createIndex("orderViewId", "orderViewId", { unique: false });
      } else {
        // 如果对象存储已经存在，可以添加缺失的索引
        const store = event.target.transaction.objectStore(storeName);

        if (!store.indexNames.contains("platform")) {
          store.createIndex("platform", "platform", { unique: false });
        }

        if (!store.indexNames.contains("request_id")) {
          store.createIndex("request_id", "request_id", { unique: false });
        }

        if (!store.indexNames.contains("orderViewId")) {
          store.createIndex("orderViewId", "orderViewId", { unique: false });
        }
      }
    };
  });
}

function saveToDatabase(data, type) {
  if (!data) {
    return Promise.reject()
  }

  return openDatabase().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);

      console.log("Key path:", store.keyPath); // 显示主键字段
      console.log("Auto increment:", store.autoIncrement); // 是否自增

      let requests = [];

      const checkAndUpdateData = (item) => {
        return new Promise((resolveUpdate, rejectUpdate) => {
          const index = store.index("platform");
          const request = index.getAll("deliveroo"); // 获取 platform 为 deliveroo 的所有记录

          request.onsuccess = () => {
            const records = request.result;
            const matchingRecord = records.find(
              (record) =>
                record.request_id == item.request_id &&
                record.orderViewId == item.orderViewId
            );

            if (matchingRecord) {
              // 修改目标记录的字段
              matchingRecord.products = item.products;
              matchingRecord.productPrice = item.productPrice;
              matchingRecord.actTotal = item.actTotal;

              // 更新数据库中的记录
              const updateRequest = store.put(matchingRecord);
              updateRequest.onsuccess = () => resolveUpdate();
              updateRequest.onerror = () => rejectUpdate(updateRequest.error);
            } else {
              // 如果没有匹配的记录，则直接新增
              const addRequest = store.add(item);
              addRequest.onsuccess = () => resolveUpdate();
              addRequest.onerror = () => rejectUpdate(addRequest.error);
            }
          };

          request.onerror = () => {
            console.error("从数据库获取 deliveroo 数据时出错:", request.error);
            rejectUpdate(request.error);
          };
        });
      };

      // 保存数据逻辑
      const saveData = async () => {
        if (type === "arr") {
          if (data && data.length) {
            for (const item of data) {
              if (item.url.startsWith("https://restaurant-hub-data-api.deliveroo.net/api/insights/refunds/")) {
                await checkAndUpdateData(item); // 判断并更新数据
              } else {
                const request = store.add(item);
                requests.push(request);
              }
            }
          }
        } else {
          if (data && data.url && data.url.startsWith("https://restaurant-hub-data-api.deliveroo.net/api/insights/refunds/")) {
            await checkAndUpdateData(data); // 判断并更新数据
          } else {
            const request = store.add(data);
            requests.push(request);
          }
        }

        // 处理新增记录的事件
        let successCount = 0;
        let errorOccurred = false;

        requests.forEach((request) => {
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

        // 如果没有新增记录，直接成功回调
        if (!requests.length) {
          resolve();
        }
      };

      saveData().catch((error) => {
        console.error("保存数据时出错:", error);
        reject(error);
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
        const data = request.result;
        resolve(data);
      };

      request.onerror = () => {
        console.error("從 IndexedDB 獲取數據時出錯:", request.error);
        reject(request.error);
      };
    });
  });
}

function clearDatabase(sendResponse) {
  return openDatabase().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => {
        console.log("IndexedDB 數據已成功清除");
        sendResponse && sendResponse({ success: true })
        resolve();
      };

      request.onerror = () => {
        console.error("清除 IndexedDB 數據時出錯:", request.error);
        sendResponse && sendResponse({ success: false })
        reject(request.error);
      };
    });
  });
}

function handleApiData(url, data) {
  const value = JSON.parse(data)
  // 時間戳轉成東八區時間 2024-11-06 00:00:00
  const getDateTime = (val) => {
    const date = new Date(val)
    date.setHours(date.getHours() + 8)
    return date.toISOString().replace('T', ' ').substring(0, 19)
  }

  const centToYuan = (val) => {
    return Number((val / 100).toFixed(2))
  }

  const mul = (a, b) => {
    if (!a) a = 0;
    if (!b) b = 0;
    let c = 0;
    const d = String(a);
    const e = String(b);
    try {
      c += d.split(".")[1].length;
    } catch (f) {
      //
    }
    try {
      c += e.split(".")[1].length;
    } catch (f) {
      //
    }
    return (
      (Number(d.replace(".", "")) * Number(e.replace(".", ""))) / Math.pow(10, c)
    );
  }

  const sub = (a, b) => {
    if (!a) a = 0;
    if (!b) b = 0;
    let c = 0,
      d = 0,
      e = 0;
    try {
      c = String(a).split(".")[1].length;
    } catch (f) {
      c = 0;
    }
    try {
      d = String(b).split(".")[1].length;
    } catch (f) {
      d = 0;
    }
    e = Math.pow(10, Math.max(c, d));
    return (mul(a, e) - mul(b, e)) / e;
  }

  const getGroupInfo = (group)=>{
    let spuName = ''
    let price = 0
    let count = 0
    if (group && group.shopProductGroupSkuList.length){
      const info =  group.shopProductGroupSkuList[0]
      spuName = info && info.spuName || ''
      price = info && info.price || 0
      count = info && info.groupSkuCount || 0
    }

    return {
      spuName,
      price,
      count
    }
  }

  const getProductsKeeta = (el) => {
    if (el.rebates && el.rebates.residueProducts && el.rebates.residueProducts.length) {
      //部分退款
      return el.rebates.residueProducts.map(item => {
        return {
          count: Number(item.count),
          originPrice: centToYuan(mul(item.priceWithoutGroup.originAmount, item.count)),
          name: item.name,
          price: centToYuan(mul(item.priceWithoutGroup.amount, item.count)),
          groups: item.groups.map(group => {
           const info =  getGroupInfo(group)
            return {
              name: info.spuName,
              price: centToYuan(info.price),
              originPrice: centToYuan(info.price),
              count: Number(info.count),
              groupSkuCount: Number(info.count)
            }
          })
        }
      })
    } else {
      //无退款
      return el.products.map(item => {
        return {
          count: Number(item.count),
          originPrice: Number(centToYuan(item.priceWithoutGroup.amount)),
          name: item.name,
          price: Number(centToYuan(item.priceWithoutGroup.originAmount)),
          groups: item.groups.map(group => {
            const info = getGroupInfo(group)
            return {
              name: info.spuName,
              price: Number(centToYuan(info.price)),
              originPrice: Number(centToYuan(info.price)),
              count: Number(info.count),
              groupSkuCount: Number(info.count)
            }
          })
        }
      })
    }

  }

  const getShopName = (value) => {
    if (value.restaurant_id === '608619') {
      return 'WeBite Space'
    }

    if (value.restaurant_id === '657634') {
      return 'WeBite Space (Tsim Sha Tsui)'
    }

    return ''
  }

  const getProductPrice = (value) => {
    const price = value.items.filter(el => !el.refund_reason).reduce((acc, product) => {
      acc += product.total_price.fractional
      return acc
    }, 0)

    return centToYuan(price)
  }

  if (url.startsWith('https://merchant.mykeeta.com')) {
    // keeta
    const orderInfos = value.data && value.data.list && value.data.list.filter(el => el.merchantOrder.status === 40).map((el, idx) => {
      return {
        url,
        timestamp: new Date().getTime() + idx,
        platform: 'keeta',
        seqNo: el.merchantOrder.userGetMode === 'pickup' ? `PU${el.merchantOrder.seqNo}` : String(el.merchantOrder.seqNo),///取餐號
        status: el.merchantOrder.status === 40 ? '已完成' : '未完成',///訂單狀態
        orderViewId: String(el.merchantOrder.orderViewId),///訂單號
        shopId: el.merchantOrder.shopId, ///門店id
        shopName: el.merchantOrder.shopName,///門店名稱
        unconfirmedStatusTime: getDateTime(el.merchantOrder.ctime),///顧客下單時間
        confirmedStatusTime: getDateTime(el.merchantOrder.confirmedStatusTime),///商家接單時間
        readiedStatusTime: getDateTime(el.merchantOrder.readiedStatusTime),///商家出餐時間
        completedStatusTime: getDateTime(el.merchantOrder.completedStatusTime),///訂單送達時間
        products: getProductsKeeta(el),//商品信息
        brokerage: centToYuan(el.feeDtl.merchantFee.rebatesBrokerage ? el.feeDtl.merchantFee.rebatesBrokerage : el.feeDtl.merchantFee.brokerage), ///佣金
        activityFee: centToYuan(el.feeDtl.merchantFee.rebatesActivityFee ? el.feeDtl.merchantFee.rebatesActivityFee : el.feeDtl.merchantFee.activityFee), ///商家承擔活動費用
        total: centToYuan(el.feeDtl.merchantFee.rebatesTotal ? el.feeDtl.merchantFee.rebatesTotal : el.feeDtl.merchantFee.total), ///預計收入
        diffPrice: centToYuan(el.feeDtl.merchantFee.rebatesDiffPrice ? el.feeDtl.merchantFee.rebatesDiffPrice : el.feeDtl.merchantFee.diffPrice), ///最低消費金額補差價
        productPrice: centToYuan(el.feeDtl.customerFee.rebatesProductPrice ? el.feeDtl.customerFee.rebatesProductPrice : el.feeDtl.customerFee.productPrice), ///菜品總價
        shippingFee: centToYuan(el.feeDtl.customerFee.rebatesShippingFee ? el.feeDtl.customerFee.rebatesShippingFee : el.feeDtl.customerFee.shippingFee), ///配送費
        platformFee: centToYuan(el.feeDtl.customerFee.rebatesPlatformFee ? el.feeDtl.customerFee.rebatesPlatformFee : el.feeDtl.customerFee.platformFee), ///平臺費
        discounts: centToYuan(el.feeDtl.customerFee.rebatesDiscounts ? el.feeDtl.customerFee.rebatesDiscounts : el.feeDtl.customerFee.discounts), ///優惠金額
        actTotal: centToYuan(el.feeDtl.customerFee.rebatesPayTotal ? el.feeDtl.customerFee.rebatesPayTotal : el.feeDtl.customerFee.payTotal), ///顧客實際支付
        deliveryOrderType: el.merchantOrder.userGetMode === 'pickup' ? '顧客自取' : '外送', ///配送類型
        remark: centToYuan(el.feeDtl.customerFee.tip ? el.feeDtl.customerFee.tip : ''), ///備註
      }
    })

    return orderInfos
  } else if (url.startsWith('https://merchant.openrice.com')) {
    // openrice
    const orderInfos = value.data && value.data && value.data.filter(el => el.status === 10).map((el, idx) => {
      return {
        url,
        timestamp: new Date().getTime() + idx,
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
  } else if (url.startsWith('https://vagw-api.ap.prd.portal.restaurant/query') && value && value.data && value.data.orders && value.data.orders.order && value.data.orders.order.order && value.data.orders.order.order.status === 'DELIVERED') {
    // foodpanda
    const orderData = value.data.orders.order
    const getStatusTime = (val, val2) => {
      const status = orderData.orderStatuses.find(el => el.status === val)
      const status2 = val2 && orderData.orderStatuses.find(el => el.status === val2)
      if (status && status.timestamp) {
        return getDateTime(status.timestamp)
      } else if (status2 && status2.timestamp) {
        return getDateTime(status2.timestamp)
      }
      return ''
    }

    const getDiscounts = () => {
      return orderData && orderData.billing && orderData.billing.expense && orderData.billing.expense.totalDiscount || 0
    }
    return {
      url,
      timestamp: new Date().getTime(),
      platform: 'foodpanda',
      seqNo: '',///取餐號
      status: orderData.order.status === 'DELIVERED' ? '已完成' : '未完成',///訂單狀態
      orderViewId: orderData.order.orderId,///訂單號
      shopId: orderData.order.vendorId, ///門店id
      shopName: orderData.order.vendorName,///門店名稱
      unconfirmedStatusTime: getStatusTime('SENDING_TO_VENDOR'),///顧客下單時間
      confirmedStatusTime: getStatusTime('ACCEPTED'),///商家接單時間
      readiedStatusTime: getStatusTime('ORDER_PREPARED', 'COURIER_NEAR_PICK_UP'),///商家出餐時間
      completedStatusTime: getStatusTime('DELIVERED'),///訂單送達時間
      products: orderData.order.items && orderData.order.items.map(product => {
        return {
          count: product.quantity,
          originPrice: mul(product.unitPrice, product.quantity),
          name: product.parentName !== product.name ? `${product.parentName}(${product.name})` : product.name,
          price: mul(product.unitPrice, product.quantity),
          groups: product.options && product.options.map(group => {
            const count = mul(product.quantity, group.quantity)
            return {
              count,
              originPrice: mul(count, group.unitPrice),
              name: group.name,
              price: mul(count, group.unitPrice),
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
      discounts: getDiscounts(), ///優惠金額
      actTotal: sub(orderData.order.orderValue, getDiscounts()), ///顧客實際支付
      deliveryOrderType: orderData.order.delivery.provider === 'pickup' ? '自取' : '配送', ///配送類型
      remark: '', ///備註
    }
  } else if (url.startsWith('https://restaurant-hub-data-api.deliveroo.net/api/orders') && value.status !== 'cancelled') {
    // deliveroo
    // https://restaurant-hub-data-api.deliveroo.net/api/insights/refunds/69d11cfd-4c27-3084-a689-95da0a089ff4
    // https://restaurant-hub-data-api.deliveroo.net/api/orders/69d11cfd-4c27-3084-a689-95da0a089ff4
    return {
      url,
      timestamp: new Date().getTime(),
      platform: 'deliveroo',
      seqNo: '',///取餐號
      status: '已完成',///訂單狀態
      orderViewId: value.order_number,///訂單號
      shopId: value.restaurant_id, ///門店id
      shopName: getShopName(value),///門店名稱
      unconfirmedStatusTime: getDateTime(value.timeline.placed_at),///顧客下單時間
      confirmedStatusTime: getDateTime(value.timeline.accepted_at),///商家接單時間
      readiedStatusTime: getDateTime(value.timeline.prepare_for),///商家出餐時間
      completedStatusTime: value.timeline.delivery_picked_up_at ? getDateTime(value.timeline.delivery_picked_up_at) : '',///訂單送達時間
      products: value.items.map(product => {
        return {
          count: product.quantity,
          originPrice: centToYuan(product.total_price.fractional),
          name: product.name,
          price: centToYuan(product.total_price.fractional),
          groups: product.modifiers && product.modifiers.length && product.modifiers.map(group => {
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

      request_id: value.id
    }
  } else if (url.startsWith('https://restaurant-hub-data-api.deliveroo.net/api/insights/refunds/') && value.order_id) {
    // deliveroo
    // https://restaurant-hub-data-api.deliveroo.net/api/insights/refunds/69d11cfd-4c27-3084-a689-95da0a089ff4
    // https://restaurant-hub-data-api.deliveroo.net/api/orders/69d11cfd-4c27-3084-a689-95da0a089ff4
    const [a, request_id] = url.split('https://restaurant-hub-data-api.deliveroo.net/api/insights/refunds/')
    return {
      url,
      timestamp: new Date().getTime(),
      platform: 'deliveroo',
      seqNo: '',///取餐號
      status: '已完成',///訂單狀態
      orderViewId: value.order_number,///訂單號
      shopId: value.branch_id, ///門店id
      shopName: value.branch_name,///門店名稱
      unconfirmedStatusTime: '',///顧客下單時間
      confirmedStatusTime: '',///商家接單時間
      readiedStatusTime: '',///商家出餐時間
      completedStatusTime: '',///訂單送達時間
      products: value.items.filter(el => !el.refund_reason).map(product => {
        return {
          count: product.quantity,
          originPrice: centToYuan(product.total_price.fractional),
          name: product.name,
          price: centToYuan(product.total_price.fractional),
          groups: product.modifiers && product.modifiers.length && product.modifiers.map(group => {
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
      productPrice: getProductPrice(value), ///菜品總價
      shippingFee: '', ///配送費
      platformFee: '', ///平臺費
      discounts: '', ///優惠金額
      actTotal: getProductPrice(value), ///顧客實際支付
      deliveryOrderType: '', ///配送類型
      remark: '', ///備註

      request_id
    }
  }
}

function saveData(url, data, sendResponse) {

  const apiData = handleApiData(url, data)

  if (apiData && url.startsWith('https://vagw-api.ap.prd.portal.restaurant/query') || url.startsWith('https://restaurant-hub-data-api.deliveroo.net/api/orders') || url.startsWith('https://restaurant-hub-data-api.deliveroo.net/api/insights/refunds/')) {
    saveToDatabase(apiData).then(() => {
      sendResponse({ success: true })
    }).catch((error) => {
      console.error("保存數據到 IndexedDB 時出錯:", error);
      sendResponse({ success: false })
    });
  } else if (apiData) {
    saveToDatabase(apiData, 'arr').then(() => {
      sendResponse({ success: true })
    }).catch((error) => {
      console.error("保存數據到 IndexedDB 時出錯:", error);
      sendResponse({ success: false })
    });
  } else {
  }
}

function filterData(arr) {
  const seen = new Set();
  const uniqueArr = arr.filter(item => {
    if (!seen.has(String(item.orderViewId) + item.platform)) {
      seen.add(String(item.orderViewId) + item.platform);
      return true;
    }
    return false;
  });
  return uniqueArr
}

function exportData(sendResponse) {
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
        if (item.products && item.products.length) {
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

        clearDatabase(sendResponse)
      };
      reader.readAsDataURL(blob);

    })
    .catch(error => {
      sendResponse({ success: false })
      console.error("從 IndexedDB 獲取數據時出錯:", error);
    });
}

// 監聽來自 popup 和 content.js的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "start") {
    startListening(sendResponse, message.tabId, message.url);
  } else if (message.action === "stop") {
    stopListening(sendResponse, message.tabId, message.url);
  } else if (message.action === "export") {
    exportData(sendResponse);
  } else if (message.action === "clearData") {
    clearDatabase().then(() => {
      return getDataFromDatabase()
    }).then((data) => {
      const uniqueData = filterData(data)
      sendResponse({ success: true, count: uniqueData.length });
      return uniqueData.length
    }).catch(() => {
      console.log(error)
      sendResponse({ success: false, count: 0 })
    })
  } else if (message.type === 'ajaxInterceptor' && message.action === 'saveData') {
    saveData(message.url, message.data, sendResponse);
  } else if (message.type === 'ajaxInterceptor' && message.action === 'checkListening') {
    checkListeningState(message.tabId, sendResponse);
  } else if (message.action === 'getTabId') {
    if (sender.tab) {
      sendResponse({ tabId: sender.tab.id });
    } else {
      sendResponse({ tabId: null });
    }
  } else if (message.action === 'getDataCount') {
    getDataFromDatabase()
      .then(data => {
        const uniqueData = filterData(data)
        sendResponse({ success: true, count: uniqueData.length });
        return uniqueData.length
      }).catch(error => {
        console.log(error)
        sendResponse({ success: false, count: 0 })
      })
    return true
  }

  return true
});

// 监听标签页被销毁事件
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  console.log(`标签页 ${tabId} 被销毁`);

  chrome.storage.local.get("listeningTabs", (result) => {
    const listeningTabs = result.listeningTabs || {};

    if (listeningTabs[tabId]) {
      delete listeningTabs[tabId];
      chrome.storage.local.set({ listeningTabs }, () => {
        console.log(`已从存储中移除标签页 ${tabId} 的状态`);
      });
    } else {
      console.log(`标签页 ${tabId} 的状态未在存储中找到，无需移除`);
    }
  });
});

function startListening(sendResponse, tabId, url) {
  if (!tabId || !url) {
    console.warn("无效的 tabId 或 URL，无法启动监听");
    sendResponse && sendResponse({ success: false, message: "Invalid tabId or URL" });
    return;
  }

  console.log(`启动监听: TabId=${tabId}, URL=${url}`);
  updateListeningState(tabId, url, true); // 更新监听状态

  chrome.tabs.sendMessage(tabId, {
    type: "ajaxInterceptor",
    to: "pageScript",
    action: "start"
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn(`无法向标签页 ${tabId} 发送消息: `, chrome.runtime.lastError.message);
      sendResponse && sendResponse({ success: false, error: chrome.runtime.lastError.message });
    } else {
      console.log(`已通知标签页 ${tabId} 开始监听`);
      sendResponse && sendResponse({ success: true });
    }
  });
}

function stopListening(sendResponse, tabId, url) {
  if (!tabId) {
    console.warn("无效的 tabId，无法停止监听");
    sendResponse && sendResponse({ success: false, message: "Invalid tabId" });
    return;
  }

  console.log(`停止监听: TabId=${tabId}`);
  updateListeningState(tabId, url, false); // 更新监听状态

  chrome.tabs.sendMessage(tabId, {
    type: "ajaxInterceptor",
    to: "pageScript",
    action: "stop"
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn(`无法向标签页 ${tabId} 发送消息: `, chrome.runtime.lastError.message);
      sendResponse && sendResponse({ success: false, error: chrome.runtime.lastError.message });
    } else {
      console.log(`已通知标签页 ${tabId} 停止监听`);
      sendResponse && sendResponse({ success: true });
    }
  });
}

function updateListeningState(tabId, url, isListening) {
  chrome.storage.local.get("listeningTabs", (result) => {
    const listeningTabs = result.listeningTabs || {};

    if (isListening) {
      listeningTabs[tabId] = { url, isListening };
    } else {
      delete listeningTabs[tabId];
    }

    chrome.storage.local.set({ listeningTabs }, () => {
      console.log("更新 listeningTabs:", listeningTabs);
    });
  });
}


// function checkListeningState2(tabId, sendResponse) {
//   chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
//     const currentTab = tabs[0];
//     if (currentTab && currentTab.url.startsWith("https://partner-hub.deliveroo.com/orders/")) {
//       chrome.storage.local.get("listeningTabs", (result) => {
//         const listeningTabs = result.listeningTabs || {};
//         if (!listeningTabs[currentTab.id]) {
//           listeningTabs[currentTab.id] = {};
//         }
//         listeningTabs[currentTab.id].isListening = true;

//         chrome.storage.local.set({ listeningTabs }, () => {
//           console.log("Updated listeningTabs:", listeningTabs);
//         });

//         sendResponse({ isListening: true });
//       });
//     } else {
//       chrome.storage.local.get("listeningTabs", (result) => {
//         const listeningTabs = result.listeningTabs || {};
//         const state = listeningTabs[tabId]?.isListening || false;
//         sendResponse({ isListening: state });
//       });
//     }
//   });
// }


function checkListeningState(tabId, sendResponse) {
  chrome.tabs.query({}, (tabs) => {
    chrome.storage.local.get("listeningTabs", (result) => {
      const listeningTabs = result.listeningTabs || {};

      tabs.forEach((tab) => {
        if ((tab.url && tab.url.startsWith("https://partner-hub.deliveroo.com/orders/")) || (tab.url && tab.url.startsWith('https://partner.foodpanda.com/orders'))) {
          if (!listeningTabs[tab.id]) {
            listeningTabs[tab.id] = {};
          }
          listeningTabs[tab.id].isListening = true;
        }
      });

      chrome.storage.local.set({ listeningTabs }, () => {
        console.log("Updated listeningTabs:", listeningTabs);
      });

      const state = listeningTabs[tabId]?.isListening || false;
      sendResponse({ isListening: state });
    });
  });
}










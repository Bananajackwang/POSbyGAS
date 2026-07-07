function doGet() {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('POS 點餐系統')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
      .addMetaTag('apple-mobile-web-app-capable', 'yes');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// 取得初始資料 (商品與人員)
function getInitialData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. 取得商品
  const productsSheet = ss.getSheetByName('商品清單');
  let products = [];
  let categories = [];
  
  if (productsSheet) {
    const data = productsSheet.getDataRange().getValues();
    if (data.length > 1) {
      // 假設第一行是標題: 分類, 品名, 單價, 圖片(Icon)
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row[0] || !row[1]) continue; // 跳過空行
        
        const cat = row[0].toString();
        if (!categories.includes(cat)) {
          categories.push(cat);
        }
        
        products.push({
          id: 'p' + i,
          category: cat,
          name: row[1].toString(),
          price: Number(row[2]) || 0,
          icon: row[3] ? row[3].toString() : '📦'
        });
      }
    }
  }

  return {
    categories: categories,
    products: products
  };
}

// 儲存訂單
function submitOrder(orderData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let ordersSheet = ss.getSheetByName('訂單紀錄');
  
  // 如果沒有工作表則建立
  if (!ordersSheet) {
    ordersSheet = ss.insertSheet('訂單紀錄');
    ordersSheet.appendRow(['訂單時間', '處理人員', '總金額', '購買明細']);
  }
  
  // 組合明細字串
  const detailsString = orderData.items.map(item => 
    `${item.name} x ${item.quantity} ($${item.subtotal})`
  ).join('\n');
  
  ordersSheet.appendRow([
    orderData.timestamp,
    '', // 處理人員留空，保留欄位順序以防跑版
    orderData.totalAmount,
    detailsString
  ]);
  
  return true;
}

// 取得銷售紀錄 (最新 50 筆)
function getSalesHistory() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName('訂單紀錄');
  
  if (!ordersSheet) return [];
  
  const data = ordersSheet.getDataRange().getValues();
  if (data.length <= 1) return []; // 只有標題或空白
  
  let history = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    
    history.push({
      timestamp: row[0].toString(),
      totalAmount: row[2] ? Number(row[2]) : 0,
      details: row[3] ? row[3].toString() : ''
    });
  }
  
  // 反轉陣列，最新的在最前面，並取前 50 筆
  history.reverse();
  return history.slice(0, 50);
}

// 作廢訂單
function voidOrder(timestamp) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName('訂單紀錄');
  
  if (!ordersSheet) return false;
  
  const data = ordersSheet.getDataRange().getValues();
  
  // 從最後一行開始往前找，因為通常要作廢的是最近的訂單
  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (row[0] && row[0].toString() === timestamp.toString()) {
      // 找到該筆訂單，將總金額設為 0
      ordersSheet.getRange(i + 1, 3).setValue(0);
      
      // 在明細加上 [已作廢]
      let details = row[3] ? row[3].toString() : '';
      if (!details.includes('[已作廢]')) {
        ordersSheet.getRange(i + 1, 4).setValue(details + '\n\n[已作廢]');
      }
      return true;
    }
  }
  
  return false;
}

// 批量儲存離線訂單 (同步用)
function submitBulkOrders(ordersArray) {
  if (!ordersArray || !ordersArray.length) return true;
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let ordersSheet = ss.getSheetByName('訂單紀錄');
  
  if (!ordersSheet) {
    ordersSheet = ss.insertSheet('訂單紀錄');
    ordersSheet.appendRow(['訂單時間', '處理人員', '總金額', '購買明細']);
  }
  
  const rowsToAppend = ordersArray.map(orderData => {
    const detailsString = orderData.items.map(item => 
      `${item.name} x ${item.quantity} ($${item.subtotal})`
    ).join('\n');
    
    return [
      orderData.timestamp,
      '', // 處理人員留空
      orderData.totalAmount,
      detailsString
    ];
  });
  
  // 為了效能，可以直接使用 getRange().setValues() 批次寫入，但 appendRow 也行，或者直接寫入
  // 這裡使用更有效率的寫入方式
  const startRow = ordersSheet.getLastRow() + 1;
  ordersSheet.getRange(startRow, 1, rowsToAppend.length, 4).setValues(rowsToAppend);
  
  return true;
}

// 取得單日報表資料
function getDailyReportData(targetDateStr) {
  let targetDateObj;
  if (targetDateStr) {
    targetDateObj = new Date(targetDateStr);
  } else {
    // 預設為台北時間的「今日」
    const nowStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' });
    targetDateObj = new Date(nowStr);
  }
  
  const y = targetDateObj.getFullYear();
  const m = targetDateObj.getMonth() + 1;
  const d = targetDateObj.getDate();
  
  // 建立多種可能的日期格式來做比對
  const datePatterns = [
    `${y}/${m}/${d}`,
    `${y}/0${m}/${d}`,
    `${y}/${m}/0${d}`,
    `${y}/0${m}/0${d}`,
    `${y}-${m}-${d}`,
    `${y}-0${m}-${d}`,
    `${y}-${m}-0${d}`,
    `${y}-0${m}-0${d}`
  ];
  
  const displayDate = `${y}/${m}/${d}`;
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName('訂單紀錄');
  if (!ordersSheet) return null;
  
  const data = ordersSheet.getDataRange().getValues();
  if (data.length <= 1) return null;
  
  let totalSales = 0;
  let totalOrders = 0;
  let hourlySales = {}; // { '08': 100, '09': 500 ... }
  let itemSales = {}; // { 'Item Name': { qty: 0, amount: 0 } }
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    
    // timestamp 可能是 Date 物件或字串
    let timestampStr = '';
    if (row[0] instanceof Date) {
        timestampStr = row[0].toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
    } else {
        timestampStr = row[0].toString();
    }
    
    // 檢查是否符合目標日期
    let matchesDate = false;
    for(const pattern of datePatterns) {
        if(timestampStr.startsWith(pattern)) {
            matchesDate = true;
            break;
        }
    }
    if(!matchesDate) continue;
    
    const details = row[3] ? row[3].toString() : '';
    // 跳過已作廢的訂單
    if (details.includes('[已作廢]')) continue;
    
    const amount = Number(row[2]) || 0;
    
    totalSales += amount;
    totalOrders++;
    
    // 嘗試解析小時
    let hourStr = '00';
    const timeMatch = timestampStr.match(/(\d{1,2}):\d{2}:\d{2}/);
    if (timeMatch) {
        let h = parseInt(timeMatch[1], 10);
        if (timestampStr.includes('下午') && h < 12) h += 12;
        if (timestampStr.includes('上午') && h === 12) h = 0;
        hourStr = h.toString().padStart(2, '0');
    }
    
    hourlySales[hourStr] = (hourlySales[hourStr] || 0) + amount;
    
    // 解析購買明細
    const lines = details.split('\n');
    lines.forEach(line => {
      line = line.trim();
      if (!line || line === '[已作廢]' || line.startsWith('[折扣]')) return;
      
      // 格式: 品名 x 數量 ($小計)
      const match = line.match(/(.+) x (\d+) \(\$(\d+)\)/);
      if (match) {
        const name = match[1].trim();
        const qty = parseInt(match[2], 10);
        const subtotal = parseInt(match[3], 10);
        
        if (!itemSales[name]) {
          itemSales[name] = { qty: 0, amount: 0 };
        }
        itemSales[name].qty += qty;
        itemSales[name].amount += subtotal;
      }
    });
  }
  
  // 整理 Top Items 陣列並排序
  let topItems = Object.keys(itemSales).map(key => ({
    name: key,
    qty: itemSales[key].qty,
    amount: itemSales[key].amount
  }));
  topItems.sort((a, b) => b.amount - a.amount); // 依銷售額降冪
  
  return {
    date: displayDate,
    totalSales: totalSales,
    totalOrders: totalOrders,
    averageOrderValue: totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0,
    hourlySales: hourlySales,
    topItems: topItems.slice(0, 10)
  };
}

if (typeof module !== 'undefined') {
  module.exports = { doGet, include, getInitialData, submitOrder, getSalesHistory, voidOrder, submitBulkOrders, getDailyReportData };
}

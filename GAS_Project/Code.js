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

if (typeof module !== 'undefined') {
  module.exports = { doGet, include, getInitialData, submitOrder, getSalesHistory, voidOrder };
}

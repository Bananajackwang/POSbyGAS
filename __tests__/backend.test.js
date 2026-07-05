describe('Code.js Backend Tests', () => {
  let mockSheet;
  let mockSpreadsheet;
  let mockHtmlTemplate;
  let codeModule;

  beforeEach(() => {
    mockHtmlTemplate = {
      evaluate: jest.fn().mockReturnThis(),
      setTitle: jest.fn().mockReturnThis(),
      addMetaTag: jest.fn().mockReturnThis(),
      getContent: jest.fn().mockReturnValue('mock html content')
    };

    global.HtmlService = {
      createTemplateFromFile: jest.fn().mockReturnValue(mockHtmlTemplate),
      createHtmlOutputFromFile: jest.fn().mockReturnValue(mockHtmlTemplate)
    };

    mockSheet = {
      getDataRange: jest.fn().mockReturnThis(),
      getValues: jest.fn(),
      appendRow: jest.fn(),
      getRange: jest.fn().mockReturnThis(),
      setValue: jest.fn()
    };

    mockSpreadsheet = {
      getSheetByName: jest.fn(),
      insertSheet: jest.fn().mockReturnValue(mockSheet)
    };

    global.SpreadsheetApp = {
      getActiveSpreadsheet: jest.fn().mockReturnValue(mockSpreadsheet)
    };

    jest.resetModules();
    codeModule = require('../GAS_Project/Code.js');
  });

  test('doGet returns correct HtmlService setup', () => {
    const result = codeModule.doGet();
    expect(global.HtmlService.createTemplateFromFile).toHaveBeenCalledWith('Index');
    expect(mockHtmlTemplate.evaluate).toHaveBeenCalled();
    expect(mockHtmlTemplate.setTitle).toHaveBeenCalledWith('POS 點餐系統');
    expect(mockHtmlTemplate.addMetaTag).toHaveBeenCalledWith('viewport', expect.any(String));
    expect(mockHtmlTemplate.addMetaTag).toHaveBeenCalledWith('apple-mobile-web-app-capable', 'yes');
    expect(result).toBe(mockHtmlTemplate);
  });

  test('include returns file content', () => {
    const result = codeModule.include('style');
    expect(global.HtmlService.createHtmlOutputFromFile).toHaveBeenCalledWith('style');
    expect(mockHtmlTemplate.getContent).toHaveBeenCalled();
    expect(result).toBe('mock html content');
  });

  test('getInitialData retrieves categories and products', () => {
    mockSpreadsheet.getSheetByName.mockImplementation((name) => {
      if (name === '商品清單') return mockSheet;
      return null;
    });

    mockSheet.getValues.mockReturnValue([
      ['分類', '品名', '單價', 'Icon'],
      ['主食', '招牌便當', '100', '🍱'],
      ['主食', '排骨便當', '110', ''],
      ['飲料', '無價水', '', '💧'], // Missing price -> 0
      ['', '', '', '']
    ]);

    const data = codeModule.getInitialData();
    expect(data.categories).toEqual(['主食', '飲料']);
    expect(data.products).toHaveLength(3);
    expect(data.products[2].price).toBe(0); // tests line 39 fallback
    expect(data.products[0]).toEqual({
      id: 'p1',
      category: '主食',
      name: '招牌便當',
      price: 100,
      icon: '🍱'
    });
    expect(data.products[1].icon).toBe('📦');
  });

  test('getInitialData handles missing products sheet gracefully', () => {
    mockSpreadsheet.getSheetByName.mockReturnValue(null);
    let data = codeModule.getInitialData();
    expect(data.categories).toEqual([]);
    expect(data.products).toEqual([]);

    mockSpreadsheet.getSheetByName.mockReturnValue(mockSheet);
    mockSheet.getValues.mockReturnValue([['分類']]); // data.length <= 1
    data = codeModule.getInitialData();
    expect(data.products).toEqual([]);
  });

  test('submitOrder creates new sheet if not exists and appends row', () => {
    mockSpreadsheet.getSheetByName.mockReturnValue(null);
    
    const orderData = {
      timestamp: '2023-10-01 12:00:00',
      totalAmount: 200,
      items: [
        { name: '便當', quantity: 2, subtotal: 200 }
      ]
    };

    const result = codeModule.submitOrder(orderData);
    expect(mockSpreadsheet.insertSheet).toHaveBeenCalledWith('訂單紀錄');
    expect(mockSheet.appendRow).toHaveBeenCalledWith(['訂單時間', '處理人員', '總金額', '購買明細']);
    expect(mockSheet.appendRow).toHaveBeenCalledWith([
      orderData.timestamp,
      '',
      orderData.totalAmount,
      '便當 x 2 ($200)'
    ]);
    expect(result).toBe(true);
  });

  test('submitOrder uses existing sheet and appends correctly', () => {
    mockSpreadsheet.getSheetByName.mockReturnValue(mockSheet);
    
    const orderData = {
      timestamp: '2023-10-01 12:00:00',
      totalAmount: 100,
      items: [
        { name: '紅茶', quantity: 1, subtotal: 100 }
      ]
    };

    codeModule.submitOrder(orderData);
    expect(mockSpreadsheet.insertSheet).not.toHaveBeenCalled();
    expect(mockSheet.appendRow).toHaveBeenCalledWith([
      orderData.timestamp,
      '',
      100,
      '紅茶 x 1 ($100)'
    ]);
  });

  test('getSalesHistory parses history properly and limits to 50', () => {
    mockSpreadsheet.getSheetByName.mockReturnValue(mockSheet);
    
    const mockRows = [['標題列1', '2', '3', '4']];
    for (let i = 1; i <= 60; i++) {
      mockRows.push([`T${i}`, '', `${100+i}`, `Items${i}`]);
    }
    mockRows.push(['EmptyPriceDetails', '', '', '']);

    mockSheet.getValues.mockReturnValue(mockRows);

    const history = codeModule.getSalesHistory();
    expect(history).toHaveLength(50);
    expect(history[0].timestamp).toBe('EmptyPriceDetails');
    expect(history[0].totalAmount).toBe(0); // hits row[2] fallback
    expect(history[0].details).toBe(''); // hits row[3] fallback
    expect(history[1].timestamp).toBe('T60');
  });

  test('getSalesHistory handles empty sheet gracefully', () => {
    mockSpreadsheet.getSheetByName.mockReturnValue(null);
    expect(codeModule.getSalesHistory()).toEqual([]);

    mockSpreadsheet.getSheetByName.mockReturnValue(mockSheet);
    mockSheet.getValues.mockReturnValue([['標題']]);
    expect(codeModule.getSalesHistory()).toEqual([]);
  });

  test('voidOrder finds the row and sets total to 0 and appends void tag', () => {
    mockSpreadsheet.getSheetByName.mockReturnValue(mockSheet);
    
    mockSheet.getValues.mockReturnValue([
      ['時間', '人員', '總計', '明細'],
      ['T1', '', '100', 'A'],
      ['T2', '', '200', 'B'], // Target
      ['T3', '', '0', ''] // Target without details
    ]);

    let result = codeModule.voidOrder('T2');
    expect(mockSheet.getRange).toHaveBeenCalledWith(3, 3);
    expect(mockSheet.setValue).toHaveBeenCalledWith(0);
    expect(mockSheet.getRange).toHaveBeenCalledWith(3, 4);
    expect(mockSheet.setValue).toHaveBeenCalledWith('B\n\n[已作廢]');
    expect(result).toBe(true);

    result = codeModule.voidOrder('T3');
    expect(mockSheet.getRange).toHaveBeenCalledWith(4, 4);
    expect(mockSheet.setValue).toHaveBeenCalledWith('\n\n[已作廢]');
  });

  test('voidOrder handles row already voided', () => {
    mockSpreadsheet.getSheetByName.mockReturnValue(mockSheet);
    
    mockSheet.getValues.mockReturnValue([
      ['時間', '人員', '總計', '明細'],
      ['T1', '', '0', 'A\n\n[已作廢]']
    ]);

    codeModule.voidOrder('T1');
    expect(mockSheet.getRange).toHaveBeenCalledWith(2, 3);
    expect(mockSheet.getRange).not.toHaveBeenCalledWith(2, 4);
  });

  test('voidOrder fails if order not found', () => {
    mockSpreadsheet.getSheetByName.mockReturnValue(mockSheet);
    mockSheet.getValues.mockReturnValue([['時間'], ['T1']]);
    
    const result = codeModule.voidOrder('T99');
    expect(mockSheet.getRange).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  test('voidOrder fails if sheet not found', () => {
    mockSpreadsheet.getSheetByName.mockReturnValue(null);
    const result = codeModule.voidOrder('T1');
    expect(result).toBe(false);
  });
});

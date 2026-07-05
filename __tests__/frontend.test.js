/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

const indexPath = path.resolve(__dirname, '../GAS_Project/Index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

const scriptPath = path.resolve(__dirname, '../GAS_Project/script.html');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');

// Extract JS from <script> tag
const jsCode = scriptContent.replace(/<script>/, '').replace(/<\/script>/, '');

describe('Frontend logic tests', () => {
  
  beforeEach(() => {
    // 1. Setup DOM
    document.body.innerHTML = indexHtml.match(/<body>([\s\S]*?)<\/body>/)[1];
    
    // 2. Mock google.script.run
    global.google = {
      script: {
        run: {
          withSuccessHandler: jest.fn().mockReturnThis(),
          withFailureHandler: jest.fn().mockReturnThis(),
          getInitialData: jest.fn(),
          submitOrder: jest.fn(),
          getSalesHistory: jest.fn(),
          voidOrder: jest.fn()
        }
      }
    };
    
    // 3. Mock alert and confirm
    global.alert = jest.fn();
    global.confirm = jest.fn().mockReturnValue(true);

    // 4. Reset state by evaluating the script
    // Note: state is declared with const in the script, so repeated evals in the same environment throw SyntaxError.
    // Instead of simple eval, we wrap it in an IIFE or we can just mock the DOM, then run it once, 
    // but we need to reset state between tests.
    // A trick is to use Function to create a new scope.
    const runFrontend = new Function('window', 'document', 'google', 'alert', 'confirm', jsCode + '; return { state, els, init, initData, renderCart, addToCart, clearCart, getDiscountedTotal, openCheckoutModal, updateQuantity, getTotalAmount, openHistoryModal, renderHistory, executeVoidOrder };');
    
    const exported = runFrontend(window, document, global.google, global.alert, global.confirm);
    
    // Attach exported functions to global for easier testing
    Object.assign(global, exported);
    
    // Initialize
    global.init();
    
    // Call initData directly to populate MOCK_DATA
    global.initData({
      categories: ['主食'],
      products: [{ id: '1', name: '便當', price: 100, category: '主食' }]
    });

    // Mock HTML dialog methods
    global.els.modal.showModal = jest.fn();
    global.els.modal.close = jest.fn();
    global.els.historyModal.showModal = jest.fn();
    global.els.historyModal.close = jest.fn();
  });

  test('initData populates products and sets up listeners', () => {
    expect(document.getElementById('product-grid').innerHTML).toContain('便當');
    expect(document.getElementById('product-grid').innerHTML).toContain('$100');
  });

  test('addToCart adds items and calculates totals', () => {
    global.addToCart('1');
    expect(global.state.cart).toHaveLength(1);
    expect(global.state.cart[0].quantity).toBe(1);
    expect(global.getTotalAmount()).toBe(100);
    
    global.addToCart('1');
    expect(global.state.cart[0].quantity).toBe(2);
    expect(global.getTotalAmount()).toBe(200);
    
    // DOM check
    expect(document.getElementById('total-amount').textContent).toBe('$200');
    expect(document.getElementById('checkout-btn').disabled).toBe(false);
  });

  test('updateQuantity modifies cart correctly', () => {
    global.addToCart('1');
    global.updateQuantity(0, 1);
    expect(global.state.cart[0].quantity).toBe(2);
    
    global.updateQuantity(0, -1);
    expect(global.state.cart[0].quantity).toBe(1);
    
    global.updateQuantity(0, -1);
    expect(global.state.cart).toHaveLength(0); // removed
    expect(document.getElementById('checkout-btn').disabled).toBe(true);
  });

  test('clearCart empties the cart', () => {
    global.addToCart('1');
    global.clearCart();
    expect(global.state.cart).toHaveLength(0);
    expect(document.getElementById('total-amount').textContent).toBe('$0');
  });

  test('getDiscountedTotal calculates discounts correctly', () => {
    global.addToCart('1'); // $100
    
    global.state.discount = { type: 'percent', value: 90 }; // 9折
    expect(global.getDiscountedTotal()).toBe(90);
    
    global.state.discount = { type: 'percent', value: 80 }; // 8折
    expect(global.getDiscountedTotal()).toBe(80);
    
    global.state.discount = { type: 'amount', value: 10 }; // 折10元
    expect(global.getDiscountedTotal()).toBe(90);
    
    global.state.discount = { type: 'amount', value: 50 }; // 折50元
    expect(global.getDiscountedTotal()).toBe(50);
  });

  test('openCheckoutModal initializes modal correctly', () => {
    global.addToCart('1'); // $100
    
    global.openCheckoutModal();
    expect(global.state.discount.type).toBeNull();
    expect(document.getElementById('modal-total-amount').textContent).toBe('$100');
    expect(global.els.modal.showModal).toHaveBeenCalled();
  });

  test('history modal works and triggers void order', () => {
    global.google.script.run.withSuccessHandler.mockClear();
    global.openHistoryModal();
    
    expect(global.google.script.run.withSuccessHandler).toHaveBeenCalled();
    // Simulate callback
    const successHandler = global.google.script.run.withSuccessHandler.mock.calls[0][0];
    
    successHandler([
      { timestamp: 'T1', totalAmount: 100, details: 'A' },
      { timestamp: 'T2', totalAmount: 0, details: '[已作廢]' }
    ]);
    
    expect(document.getElementById('history-list').innerHTML).toContain('T1');
    expect(document.getElementById('history-list').innerHTML).toContain('is-voided');
    
    // Simulate voiding an order
    global.executeVoidOrder('T1');
    expect(global.confirm).toHaveBeenCalled();
    expect(global.google.script.run.withSuccessHandler).toHaveBeenCalled();
    
    const voidSuccessHandler = global.google.script.run.withSuccessHandler.mock.calls[1][0];
    voidSuccessHandler({ success: true, message: '作廢成功' });
    expect(global.alert).toHaveBeenCalledWith('作廢成功');
  });
  
  test('numpad logic updates tendered amount and change', () => {
    global.addToCart('1'); // $100
    
    // Trigger button clicks for "50"
    const btn5 = Array.from(document.querySelectorAll('.numpad-btn')).find(b => b.dataset.key === '5');
    const btn0 = Array.from(document.querySelectorAll('.numpad-btn')).find(b => b.dataset.key === '0');
    
    btn5.click();
    btn0.click();
    
    expect(global.els.tenderedAmount.value).toBe('50');
    expect(global.els.modalChangeAmount.textContent).toContain('不足');
    expect(global.els.modalConfirmBtn.disabled).toBe(true);
    
    // Click quick amount +100
    const btnPlus100 = Array.from(document.querySelectorAll('.quick-btn')).find(b => b.dataset.amount === '100');
    btnPlus100.click();
    
    expect(global.els.tenderedAmount.value).toBe('150');
    expect(global.els.modalChangeAmount.textContent).toBe('$50');
    expect(global.els.modalConfirmBtn.disabled).toBe(false);
  });
  
  test('discount buttons apply discounts', () => {
    global.addToCart('1'); // $100
    global.openCheckoutModal();
    
    const btn90 = Array.from(document.querySelectorAll('.discount-btn')).find(b => b.dataset.value === '90');
    btn90.click();
    
    expect(global.state.discount.type).toBe('percent');
    expect(global.state.discount.value).toBe(90);
    expect(document.getElementById('modal-total-amount').textContent).toBe('$90');
    
    const clearBtn = document.getElementById('clear-discount-btn');
    clearBtn.click();
    
    expect(global.state.discount.type).toBeNull();
    expect(document.getElementById('modal-total-amount').textContent).toBe('$100');
  });

  test('checkout form submission', () => {
    global.addToCart('1');
    
    // mock tendered amount
    global.els.tenderedAmount.value = '100';
    
    // Submit form manually by triggering close with returnValue
    global.els.modal.returnValue = 'confirm';
    const closeEvent = new window.Event('close');
    global.els.modal.dispatchEvent(closeEvent);
    
    expect(global.google.script.run.withSuccessHandler).toHaveBeenCalled();
  });
});

// 模擬後端資料 (Google Sheets 資料)
const MOCK_DATA = {
    staff: ['王大明', '林小美', '陳店長'],
    categories: ['漢堡', '點心', '飲料'],
    products: [
        { id: 'p1', category: '漢堡', name: '經典牛肉堡', price: 120, icon: '🍔' },
        { id: 'p2', category: '漢堡', name: '雙層起司堡', price: 150, icon: '🍔' },
        { id: 'p3', category: '漢堡', name: '香雞堡', price: 100, icon: '🍔' },
        { id: 'p4', category: '點心', name: '炸薯條 (大)', price: 60, icon: '🍟' },
        { id: 'p5', category: '點心', name: '麥克雞塊 (6塊)', price: 65, icon: '🍗' },
        { id: 'p6', category: '點心', name: '蘋果派', price: 40, icon: '🥧' },
        { id: 'p7', category: '飲料', name: '可口可樂 (中)', price: 35, icon: '🥤' },
        { id: 'p8', category: '飲料', name: '冰紅茶 (大)', price: 40, icon: '🥤' },
        { id: 'p9', category: '飲料', name: '熱咖啡', price: 55, icon: '☕' },
    ]
};

// 狀態管理
const state = {
    activeCategory: MOCK_DATA.categories[0],
    activeStaff: null,
    cart: [], // { product, quantity }
};

// DOM 元素
const els = {
    // categoryTabs 已移除
    productGrid: document.getElementById('product-grid'),
    cartItems: document.getElementById('cart-items'),
    staffButtons: document.getElementById('staff-buttons'),
    totalAmount: document.getElementById('total-amount'),
    checkoutBtn: document.getElementById('checkout-btn'),
    clearCartBtn: document.getElementById('clear-cart-btn'),
    
    // Modal
    modal: document.getElementById('checkout-modal'),
    modalStaffName: document.getElementById('modal-staff-name'),
    modalTotalAmount: document.getElementById('modal-total-amount'),
    tenderedAmount: document.getElementById('tendered-amount'),
    modalChangeAmount: document.getElementById('modal-change-amount'),
    modalConfirmBtn: document.getElementById('modal-confirm-btn'),
    quickBtns: document.querySelectorAll('.quick-btn'),
};

// 初始化
function init() {
    // renderCategories();
    renderProducts();
    renderStaff();
    setupEventListeners();
}

// 渲染商品網格 (顯示所有分類)
function renderProducts() {
    let html = '';
    MOCK_DATA.categories.forEach(cat => {
        const catProducts = MOCK_DATA.products.filter(p => p.category === cat);
        if (catProducts.length > 0) {
            html += `<div class="category-header"><h3>${cat}</h3></div>`;
            catProducts.forEach(p => {
                html += `
                    <div class="product-card" data-id="${p.id}">
                        <div class="product-icon">${p.icon}</div>
                        <div class="product-name">${p.name}</div>
                        <div class="product-price">$${p.price}</div>
                    </div>
                `;
            });
        }
    });
    els.productGrid.innerHTML = html;
}

// 渲染處理人員
function renderStaff() {
    els.staffButtons.innerHTML = MOCK_DATA.staff.map(staff => `
        <button class="staff-btn ${staff === state.activeStaff ? 'active' : ''}" data-staff="${staff}">
            ${staff}
        </button>
    `).join('');
}

// 渲染購物車
function renderCart() {
    if (state.cart.length === 0) {
        els.cartItems.innerHTML = `<div class="empty-cart-message">尚未選擇任何商品</div>`;
        els.totalAmount.textContent = '$0';
        updateCheckoutBtnState();
        return;
    }

    let total = 0;
    els.cartItems.innerHTML = state.cart.map((item, index) => {
        const itemTotal = item.product.price * item.quantity;
        total += itemTotal;
        return `
            <div class="cart-item">
                <div class="cart-item-name">${item.product.name}</div>
                <div class="cart-item-price">$${item.product.price} / 單價</div>
                <div class="cart-item-actions">
                    <button class="qty-btn ${item.quantity === 1 ? 'remove' : ''}" onclick="updateQuantity(${index}, -1)">
                        ${item.quantity === 1 ? '🗑️' : '-'}
                    </button>
                    <span class="item-qty">${item.quantity}</span>
                    <button class="qty-btn" onclick="updateQuantity(${index}, 1)">+</button>
                </div>
            </div>
        `;
    }).join('');

    els.totalAmount.textContent = `$${total}`;
    updateCheckoutBtnState();
    
    // 捲動到底部
    els.cartItems.scrollTop = els.cartItems.scrollHeight;
}

function updateCheckoutBtnState() {
    const hasItems = state.cart.length > 0;
    const hasStaff = state.activeStaff !== null;
    els.checkoutBtn.disabled = !(hasItems && hasStaff);
}

// 購物車操作
function addToCart(productId) {
    const product = MOCK_DATA.products.find(p => p.id === productId);
    if (!product) return;

    const existingItemIndex = state.cart.findIndex(item => item.product.id === productId);
    
    if (existingItemIndex > -1) {
        state.cart[existingItemIndex].quantity += 1;
    } else {
        state.cart.push({ product, quantity: 1 });
    }
    
    renderCart();
}

window.updateQuantity = function(index, delta) {
    if (state.cart[index]) {
        state.cart[index].quantity += delta;
        if (state.cart[index].quantity <= 0) {
            state.cart.splice(index, 1);
        }
        renderCart();
    }
};

function clearCart() {
    state.cart = [];
    renderCart();
}

function getTotalAmount() {
    return state.cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
}

// 結帳邏輯
function openCheckoutModal() {
    const total = getTotalAmount();
    els.modalStaffName.textContent = state.activeStaff;
    els.modalTotalAmount.textContent = `$${total}`;
    els.tenderedAmount.value = '';
    updateChange();
    
    els.modal.showModal();
    // 給予焦點方便實體鍵盤輸入
    setTimeout(() => els.tenderedAmount.focus(), 100); 
}

function updateChange() {
    const total = getTotalAmount();
    const tendered = parseInt(els.tenderedAmount.value) || 0;
    
    // 如果收現金額為空，或剛好結帳
    if (els.tenderedAmount.value === '') {
        els.modalChangeAmount.textContent = '$0';
        els.modalChangeAmount.className = 'change-amount';
        els.modalConfirmBtn.disabled = false; // 允許直接結帳(不找零計算)
        return;
    }

    const change = tendered - total;
    
    if (change < 0) {
        els.modalChangeAmount.textContent = `-$${Math.abs(change)} (金額不足)`;
        els.modalChangeAmount.className = 'change-amount negative';
        els.modalConfirmBtn.disabled = true;
    } else {
        els.modalChangeAmount.textContent = `$${change}`;
        els.modalChangeAmount.className = 'change-amount';
        els.modalConfirmBtn.disabled = false;
    }
}

function completeCheckout() {
    const total = getTotalAmount();
    const orderData = {
        timestamp: new Date().toISOString(),
        staff: state.activeStaff,
        totalAmount: total,
        items: state.cart.map(i => ({
            name: i.product.name,
            price: i.product.price,
            quantity: i.quantity,
            subtotal: i.product.price * i.quantity
        }))
    };
    
    console.log('完成訂單:', orderData);
    // TODO: 送資料到 GAS 後端
    
    // 清空畫面
    els.modal.close();
    clearCart();
    alert(`結帳完成！\n處理人員：${orderData.staff}\n總計：$${orderData.totalAmount}`);
}

// 事件監聽綁定
function setupEventListeners() {
    // 數字鍵盤
    document.querySelectorAll('.numpad-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.key;
            let currentVal = els.tenderedAmount.value;
            
            if (key === 'C') {
                els.tenderedAmount.value = '';
            } else if (key === 'BACK') {
                els.tenderedAmount.value = currentVal.slice(0, -1);
            } else {
                els.tenderedAmount.value = currentVal + key;
            }
            updateChange();
        });
    });

    // 點擊商品 (使用事件委派)
    els.productGrid.addEventListener('click', e => {
        const card = e.target.closest('.product-card');
        if (card) {
            addToCart(card.dataset.id);
        }
    });

    // 點擊人員
    els.staffButtons.addEventListener('click', e => {
        if (e.target.classList.contains('staff-btn')) {
            state.activeStaff = e.target.dataset.staff;
            renderStaff();
            updateCheckoutBtnState();
        }
    });

    // 其他按鈕
    els.clearCartBtn.addEventListener('click', clearCart);
    els.checkoutBtn.addEventListener('click', openCheckoutModal);
    
    // Modal 收現計算
    els.tenderedAmount.addEventListener('input', updateChange);
    
    // 快速金額按鈕
    els.quickBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const amount = btn.dataset.amount;
            const total = getTotalAmount();
            
            if (amount === 'exact') {
                els.tenderedAmount.value = total;
            } else {
                const current = parseInt(els.tenderedAmount.value) || 0;
                els.tenderedAmount.value = current + parseInt(amount);
            }
            updateChange();
        });
    });

    // Dialog form submission handling (for the confirm button)
    els.modal.addEventListener('close', () => {
        if (els.modal.returnValue === 'confirm') {
            completeCheckout();
        }
        els.modal.returnValue = ''; // reset
    });

}

// 啟動應用
init();

// Global variables
let debounceTimeout;

// Product logic has been moved to products.js

// Utility to prevent XSS in table rendering
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// INVENTORY FUNCTIONS

async function fetchInventoryStatus() {
    try {
        const response = await fetch('/inventory/api/status');
        const data = await response.json();
        
        // Update Stats
        const statTotal = document.getElementById('statTotal');
        const statLow = document.getElementById('statLow');
        const statOut = document.getElementById('statOut');
        
        if (statTotal) statTotal.textContent = data.summary.total_products;
        if (statLow) statLow.textContent = data.summary.low_stock;
        if (statOut) statOut.textContent = data.summary.out_of_stock;
        
        // Update Table
        const tbody = document.getElementById('inventoryTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (data.items.length === 0) {
            tbody.innerHTML = getEmptyStateHTML(5, "Inventory is empty", "Add products to track their stock levels.");
            return;
        }

        data.items.forEach(p => {
            const tr = document.createElement('tr');
            
            tr.innerHTML = `
                <td>${escapeHtml(p.name)}</td>
                <td><span class="badge badge-neutral">${escapeHtml(p.category || '-')}</span></td>
                <td><strong>${p.quantity}</strong></td>
                <td><span class="badge ${p.quantity <= p.low_stock_limit ? 'badge-danger' : 'badge-success'}">${p.quantity <= p.low_stock_limit ? 'Low Stock' : 'Healthy'}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="openStockInModal(${p.id}, '${escapeHtml(p.name)}')"><i class="fa-solid fa-plus"></i> Add Stock</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
    } catch (error) {
        console.error('Error fetching inventory:', error);
    }
}

function openStockInModal(productId, productName) {
    openAdjustModal(productId, productName);
}

function openAdjustModal(productId, productName) {
    document.getElementById('adjustForm').reset();
    document.getElementById('adjustProductId').value = productId;
    document.getElementById('adjustProductName').textContent = `Adjusting stock for: ${productName}`;
    document.getElementById('adjustError').style.display = 'none';
    document.getElementById('adjustModal').style.display = 'block';
}

function closeAdjustModal() {
    document.getElementById('adjustModal').style.display = 'none';
}

async function submitAdjustment(event) {
    event.preventDefault();
    
    const payload = {
        product_id: document.getElementById('adjustProductId').value,
        transaction_type: document.getElementById('transaction_type').value,
        quantity: parseInt(document.getElementById('adjust_quantity').value, 10),
        reference: document.getElementById('reference').value
    };

    try {
        const response = await fetch('/inventory/api/adjust', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            closeAdjustModal();
            fetchInventoryStatus();
        } else {
            const errorDiv = document.getElementById('adjustError');
            errorDiv.textContent = result.error || 'Failed to adjust stock';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Error adjusting stock:', error);
    }
}

// SALES AND POS FUNCTIONS
let posProducts = [];
let cart = [];

function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById(tabId + 'Tab').classList.add('active');
}

async function fetchPOSProducts() {
    try {
        const response = await fetch('/products/api');
        posProducts = await response.json();
        renderPOSProducts();
    } catch (error) {
        console.error('Error fetching POS products:', error);
    }
}

function renderPOSProducts() {
    const grid = document.getElementById('posProductGrid');
    if (!grid) return;
    
    const search = document.getElementById('posSearch').value.toLowerCase();
    grid.innerHTML = '';
    
    posProducts.forEach(p => {
        if (!p.name.toLowerCase().includes(search)) return;
        
        const isOutOfStock = p.quantity <= 0;
        
        const card = document.createElement('div');
        card.className = `product-card ${isOutOfStock ? 'disabled' : ''}`;
        card.onclick = () => { if (!isOutOfStock) addToCart(p); };
        
        card.innerHTML = `
            <div class="product-card-title">${escapeHtml(p.name)}</div>
            <div class="product-card-price">₦${p.selling_price.toFixed(2)}</div>
            <div class="product-card-stock">${isOutOfStock ? 'Out of Stock' : p.quantity + ' in stock'}</div>
        `;
        grid.appendChild(card);
    });
}

function filterPOSProducts() {
    renderPOSProducts();
}

function addToCart(product) {
    const existingItem = cart.find(i => i.product_id === product.id);
    
    if (existingItem) {
        if (existingItem.quantity < product.quantity) {
            existingItem.quantity += 1;
        } else {
            alert('Cannot add more than available stock.');
        }
    } else {
        cart.push({
            product_id: product.id,
            name: product.name,
            unit_price: product.selling_price,
            quantity: 1,
            max_stock: product.quantity
        });
    }
    renderCart();
}

function updateCartQuantity(productId, newQty) {
    const item = cart.find(i => i.product_id === productId);
    if (!item) return;
    
    if (newQty <= 0) {
        cart = cart.filter(i => i.product_id !== productId);
    } else if (newQty > item.max_stock) {
        alert('Cannot exceed available stock.');
    } else {
        item.quantity = newQty;
    }
    renderCart();
}

function removeFromCart(productId) {
    cart = cart.filter(i => i.product_id !== productId);
    renderCart();
}

function renderCart() {
    const cartEl = document.getElementById('cartBody');
    const totalEl = document.getElementById('cartTotal');
    const checkoutBtn = document.getElementById('processSaleBtn');
    
    if (!cartEl) return;
    
    cartEl.innerHTML = '';
    let total = 0;
    
    if (cart.length === 0) {
        cartEl.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 2rem;">Cart is empty</td></tr>`;
        totalEl.textContent = '₦0.00';
        if(checkoutBtn) checkoutBtn.disabled = true;
        return;
    }
    
    if(checkoutBtn) checkoutBtn.disabled = false;
    
    cart.forEach(item => {
        const subtotal = item.unit_price * item.quantity;
        total += subtotal;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(item.name)}</strong></td>
            <td>₦${item.unit_price.toFixed(2)}</td>
            <td>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <button class="btn btn-secondary btn-sm" onclick="updateCartQuantity(${item.product_id}, ${item.quantity - 1})">-</button>
                    <span style="font-weight: bold;">${item.quantity}</span>
                    <button class="btn btn-secondary btn-sm" onclick="updateCartQuantity(${item.product_id}, ${item.quantity + 1})">+</button>
                </div>
            </td>
            <td><strong>₦${subtotal.toFixed(2)}</strong></td>
            <td>
                <button class="btn btn-danger btn-sm" onclick="removeFromCart(${item.product_id})"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        cartEl.appendChild(tr);
    });
    
    totalEl.textContent = '₦' + total.toFixed(2);
}

async function processSale() {
    if (cart.length === 0) return;
    
    const checkoutBtn = document.getElementById('checkoutBtn');
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'Processing...';
    
    const customerSelect = document.getElementById('customerSelect');
    
    const payload = {
        payment_method: document.getElementById('paymentMethod').value,
        customer_id: customerSelect && customerSelect.value ? parseInt(customerSelect.value, 10) : null,
        items: cart.map(i => ({ product_id: i.product_id, quantity: i.quantity }))
    };
    
    try {
        const response = await fetch('/sales/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            cart = [];
            renderCart();
            await fetchPOSProducts(); // Refresh stock levels
            alert(`Sale successful! Total: $${result.total_amount.toFixed(2)}`);
        } else {
            alert(result.error || 'Checkout failed');
        }
    } catch (error) {
        console.error('Checkout error:', error);
        alert('Checkout failed');
    } finally {
        checkoutBtn.disabled = cart.length === 0;
        checkoutBtn.textContent = 'Checkout';
    }
}

async function fetchSalesHistory() {
    try {
        const response = await fetch('/sales/api/history');
        const sales = await response.json();
        
        const tbody = document.getElementById('salesHistoryBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (sales.length === 0) {
            tbody.innerHTML = getEmptyStateHTML(6, "No sales recorded yet", "Complete a sale to see it listed here.");
            return;
        }

        sales.forEach(s => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${s.id}</td>
                <td>${s.created_at}</td>
                <td>${escapeHtml(s.customer_name || 'Guest')}</td>
                <td><strong>₦${s.total_amount.toFixed(2)}</strong></td>
                <td><span class="badge badge-neutral">${s.payment_method}</span></td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="viewSale(${s.id})">View Receipt</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error fetching sales history:', error);
    }
}

async function viewSale(saleId) {
    try {
        const response = await fetch(`/sales/api/${saleId}`);
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error);
        
        const rb = document.getElementById('receiptBody');
        
        let html = `
            <div style="text-align:center; margin-bottom: 1rem; border-bottom: 1px dashed #ccc; padding-bottom: 1rem;">
                <h3 style="margin:0;">BizInsight Receipt</h3>
                <div style="color:#666; font-size:0.85rem;">Sale #${data.sale.id}</div>
                <div style="color:#666; font-size:0.85rem;">${new Date(data.sale.created_at).toLocaleString()}</div>
            </div>
            <table style="width:100%; font-size:0.9rem; margin-bottom:1rem;">
        `;
        
        data.items.forEach(i => {
            html += `
                <tr>
                    <td style="padding: 0.25rem 0;">${escapeHtml(i.product_name)} x${i.quantity}</td>
                    <td style="text-align:right;">₦${i.subtotal.toFixed(2)}</td>
                </tr>
            `;
        });
        
        html += `
            </table>
            <div style="border-top: 1px solid #ccc; padding-top: 0.5rem; display:flex; justify-content:space-between; font-weight:bold; font-size:1.1rem;">
                <span>Total</span>
                <span>₦${data.sale.total_amount.toFixed(2)}</span>
            </div>
            <div style="color:#666; font-size:0.85rem; margin-top:0.5rem;">Paid via ${escapeHtml(data.sale.payment_method)}</div>
        `;
        
        rb.innerHTML = html;
        document.getElementById('receiptModal').style.display = 'block';
        
    } catch (error) {
        console.error('Error viewing receipt:', error);
        alert('Failed to load receipt.');
    }
}

// CUSTOMERS FUNCTIONS
let customers = [];

async function fetchCustomers() {
    try {
        const response = await fetch('/customers/api');
        customers = await response.json();
        renderCustomers();
    } catch (error) {
        console.error('Error fetching customers:', error);
    }
}

function renderCustomers() {
    const tbody = document.getElementById('customerTableBody');
    if (!tbody) return;
    
    const search = document.getElementById('customerSearch')?.value.toLowerCase() || '';
    tbody.innerHTML = '';
    
    const filtered = customers.filter(c => 
        c.name.toLowerCase().includes(search) || 
        (c.email && c.email.toLowerCase().includes(search)) ||
        (c.phone && c.phone.toLowerCase().includes(search))
    );
    
    if (filtered.length === 0) {
        tbody.innerHTML = getEmptyStateHTML(5, "No customers found", "Add your first customer to build your client list.");
        return;
    }
    
    filtered.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(c.name)}</strong></td>
            <td>${escapeHtml(c.email || '-')}</td>
            <td>${escapeHtml(c.phone || '-')}</td>
            <td>${c.created_at}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="viewCustomer(${c.id})"><i class="fa-solid fa-eye"></i></button>
                <button class="btn btn-sm btn-secondary" onclick='editCustomer(${JSON.stringify(c).replace(/'/g, "&#39;")})'>Edit</button>
                <button class="btn btn-sm btn-error" onclick="deleteCustomer(${c.id})">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filterCustomers() {
    renderCustomers();
}

async function loadCustomersForSelect() {
    const select = document.getElementById('customerSelect');
    if (!select) return;
    
    try {
        const response = await fetch('/customers/api');
        const data = await response.json();
        
        // Keep the first default option
        select.innerHTML = '<option value="">-- Walk-in Customer --</option>';
        data.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name + (c.phone ? ` (${c.phone})` : '');
            select.appendChild(opt);
        });
    } catch (error) {
        console.error('Error loading customers for select:', error);
    }
}

function openCustomerModal() {
    document.getElementById('customerForm').reset();
    document.getElementById('customerId').value = '';
    document.getElementById('modalTitle').textContent = 'Add Customer';
    document.getElementById('formError').style.display = 'none';
    document.getElementById('customerModal').style.display = 'block';
}

function closeCustomerModal() {
    document.getElementById('customerModal').style.display = 'none';
}

function editCustomer(customer) {
    document.getElementById('customerId').value = customer.id;
    document.getElementById('name').value = customer.name;
    document.getElementById('email').value = customer.email || '';
    document.getElementById('phone').value = customer.phone || '';
    document.getElementById('address').value = customer.address || '';
    
    document.getElementById('modalTitle').textContent = 'Edit Customer';
    document.getElementById('formError').style.display = 'none';
    document.getElementById('customerModal').style.display = 'block';
}

async function saveCustomer(event) {
    event.preventDefault();
    
    const id = document.getElementById('customerId').value;
    const url = id ? `/customers/api/${id}` : '/customers/api';
    const method = id ? 'PUT' : 'POST';
    
    const payload = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        address: document.getElementById('address').value
    };

    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            closeCustomerModal();
            fetchCustomers();
        } else {
            const errorDiv = document.getElementById('formError');
            errorDiv.textContent = result.error || 'Failed to save customer';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Error saving customer:', error);
    }
}

async function deleteCustomer(id) {
    if (!confirm('Are you sure you want to delete this customer? This will not delete their past sales, but will unlink their name.')) return;
    
    try {
        const response = await fetch(`/customers/api/${id}`, { method: 'DELETE' });
        if (response.ok) {
            fetchCustomers();
        } else {
            alert('Failed to delete customer');
        }
    } catch (error) {
        console.error('Error deleting customer:', error);
    }
}

async function viewCustomer(id) {
    try {
        const response = await fetch(`/customers/api/${id}/history`);
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error);
        
        document.getElementById('historyCustomerName').textContent = `Purchase History for ${data.customer_name}`;
        const tbody = document.getElementById('historyTableBody');
        tbody.innerHTML = '';
        
        if (data.sales.length === 0) {
            tbody.innerHTML = getEmptyStateHTML(4, "No purchases found", "This customer has not made any purchases yet.");
        } else {
            data.sales.forEach(s => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${s.created_at.split(' ')[0]}</td>
                    <td><strong>₦${s.total_amount.toFixed(2)}</strong></td>
                    <td><span class="badge badge-neutral">${s.payment_method}</span></td>
                    <td><span class="badge badge-success">Paid</span></td>
                `;
                tbody.appendChild(tr);
            });
        }
        
        document.getElementById('customerHistoryModal').style.display = 'block';
    } catch (error) {
        console.error('Error viewing customer history:', error);
        alert('Failed to load history.');
    }
}

// EXPENSES FUNCTIONS
let expenses = [];

async function fetchExpenses() {
    try {
        const response = await fetch('/expenses/api');
        expenses = await response.json();
        renderExpenses();
    } catch (error) {
        console.error('Error fetching expenses:', error);
    }
}

function renderExpenses() {
    const tbody = document.getElementById('expenseTableBody');
    if (!tbody) return;
    
    const search = document.getElementById('expenseSearch')?.value.toLowerCase() || '';
    tbody.innerHTML = '';
    
    const filtered = expenses.filter(e => 
        e.title.toLowerCase().includes(search) || 
        (e.category && e.category.toLowerCase().includes(search))
    );
    
    if (filtered.length === 0) {
        tbody.innerHTML = getEmptyStateHTML(5, "No expenses found", "Record your business expenses to track cash flow.");
        return;
    }
    
    filtered.forEach(e => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${e.expense_date}</td>
            <td style="font-weight:bold;">${escapeHtml(e.title)}</td>
            <td><span class="badge" style="background:#e5e7eb; color:#374151; padding:0.25rem 0.5rem; border-radius:4px; font-size:0.8rem;">${escapeHtml(e.category)}</span></td>
            <td style="color:var(--error-color); font-weight:bold;">-$${e.amount.toFixed(2)}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick='editExpense(${JSON.stringify(e).replace(/'/g, "&#39;")})'>Edit</button>
                <button class="btn btn-sm btn-error" onclick="deleteExpense(${e.id})">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filterExpenses() {
    renderExpenses();
}

function openExpenseModal() {
    document.getElementById('expenseForm').reset();
    document.getElementById('expenseId').value = '';
    // Set today's date as default
    document.getElementById('expense_date').value = new Date().toISOString().split('T')[0];
    document.getElementById('modalTitle').textContent = 'Add Expense';
    document.getElementById('formError').style.display = 'none';
    document.getElementById('expenseModal').style.display = 'block';
}

function closeExpenseModal() {
    document.getElementById('expenseModal').style.display = 'none';
}

function editExpense(expense) {
    document.getElementById('expenseId').value = expense.id;
    document.getElementById('title').value = expense.title;
    document.getElementById('amount').value = expense.amount;
    document.getElementById('category').value = expense.category;
    document.getElementById('expense_date').value = expense.expense_date;
    
    document.getElementById('modalTitle').textContent = 'Edit Expense';
    document.getElementById('formError').style.display = 'none';
    document.getElementById('expenseModal').style.display = 'block';
}

async function saveExpense(event) {
    event.preventDefault();
    
    const id = document.getElementById('expenseId').value;
    const url = id ? `/expenses/api/${id}` : '/expenses/api';
    const method = id ? 'PUT' : 'POST';
    
    const payload = {
        title: document.getElementById('title').value,
        amount: parseFloat(document.getElementById('amount').value),
        category: document.getElementById('category').value,
        expense_date: document.getElementById('expense_date').value
    };

    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            closeExpenseModal();
            fetchExpenses();
        } else {
            const errorDiv = document.getElementById('formError');
            errorDiv.textContent = result.error || 'Failed to save expense';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Error saving expense:', error);
    }
}

async function deleteExpense(id) {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    
    try {
        const response = await fetch(`/expenses/api/${id}`, { method: 'DELETE' });
        if (response.ok) {
            fetchExpenses();
        } else {
            alert('Failed to delete expense');
        }
    } catch (error) {
        console.error('Error deleting expense:', error);
    }
}

// DASHBOARD FUNCTIONS
async function fetchDashboardMetrics() {
    try {
        const response = await fetch('/dashboard/api/metrics');
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error || 'Failed to fetch metrics');
        
        const kpi = data.kpi;
        
        // Helper for trends
        const updateTrend = (id, val, text) => {
            const el = document.getElementById(id);
            if (!el) return;
            const isUp = val >= 0;
            const cls = isUp ? 'trend-up' : 'trend-down';
            const icon = isUp ? 'fa-arrow-up' : 'fa-arrow-down';
            el.innerHTML = `<i class="fa-solid ${icon} ${cls}"></i> <span class="${cls}">${Math.abs(val).toFixed(1)}%</span> <span class="trend-text">${text}</span>`;
        };

        // Populate KPIs
        if (document.getElementById('kpi-today-sales')) {
            document.getElementById('kpi-today-sales').textContent = `₦${(kpi.today_sales || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            updateTrend('kpi-today-trend', kpi.today_trend, 'from yesterday');
            
            document.getElementById('kpi-weekly-sales').textContent = `₦${(kpi.weekly_sales || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            updateTrend('kpi-weekly-trend', kpi.weekly_trend, 'from last week');
            
            document.getElementById('kpi-monthly-revenue').textContent = `₦${(kpi.monthly_revenue || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            updateTrend('kpi-monthly-trend', kpi.monthly_trend, 'from last month');
            
            const npEl = document.getElementById('kpi-net-profit');
            npEl.textContent = `₦${(kpi.net_profit || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            if (kpi.net_profit < 0) npEl.style.color = 'var(--status-danger)';
            else npEl.style.color = 'var(--text-primary)';
            
            updateTrend('kpi-profit-trend', kpi.profit_trend, 'from last month');
        }
        
        // Recent Transactions
        const txBody = document.getElementById('recentTransactionsBody');
        if (txBody) {
            txBody.innerHTML = '';
            if (!data.recent_transactions || data.recent_transactions.length === 0) {
                txBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 2rem;">No recent transactions. <br><a href="/sales" class="btn btn-sm btn-primary mt-2">Record Sale</a></td></tr>`;
            } else {
                data.recent_transactions.forEach(tx => {
                    const tr = document.createElement('tr');
                    const statusClass = 'badge-success'; // Simplified for now, real app might check actual status
                    tr.innerHTML = `
                        <td><strong>${escapeHtml(tx.customer_name || 'Walk-in Customer')}</strong></td>
                        <td>${escapeHtml(tx.product_name || 'Multiple items')}</td>
                        <td><strong>₦${tx.total_amount.toLocaleString()}</strong></td>
                        <td><span class="badge badge-neutral">${escapeHtml(tx.payment_method)}</span></td>
                        <td>${new Date(tx.created_at).toLocaleDateString()}</td>
                        <td><span class="badge ${statusClass}">Completed</span></td>
                    `;
                    txBody.appendChild(tr);
                });
            }
        }
        
        // Best Selling Products
        const prodBody = document.getElementById('topProductsBody');
        if (prodBody) {
            prodBody.innerHTML = '';
            if (!data.top_products || data.top_products.length === 0) {
                prodBody.innerHTML = `<tr><td colspan="3" class="text-center text-muted" style="padding: 2rem;">No product sales yet.</td></tr>`;
            } else {
                data.top_products.forEach(p => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>${escapeHtml(p.name)}</strong></td>
                        <td>${p.units_sold}</td>
                        <td>₦${(p.revenue || 0).toLocaleString()}</td>
                    `;
                    prodBody.appendChild(tr);
                });
            }
        }
        
        // Low Stock Alerts
        const stockBody = document.getElementById('lowStockBody');
        if (stockBody) {
            stockBody.innerHTML = '';
            if (!data.low_stock || data.low_stock.length === 0) {
                stockBody.innerHTML = `<tr><td colspan="3" class="text-center text-muted" style="padding: 2rem;">All stock levels are healthy!</td></tr>`;
            } else {
                data.low_stock.forEach(item => {
                    const tr = document.createElement('tr');
                    const badgeClass = item.status === 'Out of Stock' ? 'badge-danger' : 'badge-warning';
                    tr.innerHTML = `
                        <td><strong>${escapeHtml(item.name)}</strong></td>
                        <td>${item.current_stock}</td>
                        <td><span class="badge ${badgeClass}">${item.status}</span></td>
                    `;
                    stockBody.appendChild(tr);
                });
            }
        }

        // Business Insight
        const insightCard = document.getElementById('insightCard');
        if (insightCard) {
            if (kpi.weekly_trend > 0) {
                insightCard.innerHTML = `
                    <div class="icon"><i class="fa-solid fa-arrow-trend-up"></i></div>
                    <h3>Your sales increased ${Math.round(kpi.weekly_trend)}% this week!</h3>
                    <p>Great job! Your business is growing faster than last week.</p>
                    <a href="/analytics" class="btn btn-primary btn-sm">View Analytics &rarr;</a>
                `;
            } else if (kpi.weekly_trend < 0) {
                insightCard.innerHTML = `
                    <div class="icon" style="color: var(--status-warning);"><i class="fa-solid fa-chart-line"></i></div>
                    <h3 style="color: var(--text-primary);">Sales are down ${Math.round(Math.abs(kpi.weekly_trend))}% this week.</h3>
                    <p>Consider running a promotion to boost sales.</p>
                    <a href="/sales" class="btn btn-primary btn-sm">Record Sale &rarr;</a>
                `;
            } else {
                insightCard.innerHTML = `
                    <div class="icon"><i class="fa-solid fa-lightbulb"></i></div>
                    <h3>Keep up the good work!</h3>
                    <p>Your business insights will appear here as you record more sales.</p>
                    <a href="/products" class="btn btn-primary btn-sm">Manage Products &rarr;</a>
                `;
            }
        }
        
    } catch (error) {
        console.error('Error fetching dashboard metrics:', error);
    }
}

// DASHBOARD CHART
let dashboardChartInstance = null;

async function fetchDashboardChart(days) {
    try {
        const response = await fetch(`/dashboard/api/sales_trend?days=${days}`);
        const data = await response.json();
        
        const ctx = document.getElementById('salesOverviewChart');
        const emptyState = document.getElementById('salesChartEmptyState');
        if (!ctx) return;
        
        if (dashboardChartInstance) {
            dashboardChartInstance.destroy();
        }
        
        if (data.labels.length === 0) {
            ctx.style.display = 'none';
            if (emptyState) emptyState.style.display = 'flex';
            return;
        }
        
        ctx.style.display = 'block';
        if (emptyState) emptyState.style.display = 'none';
        
        dashboardChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Sales Revenue (₦)',
                    data: data.data,
                    borderColor: '#1C54F2',
                    backgroundColor: 'rgba(28, 84, 242, 0.1)',
                    borderWidth: 2,
                    pointBackgroundColor: '#1C54F2',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#0F172A',
                        padding: 10,
                        titleFont: { size: 13 },
                        bodyFont: { size: 14, weight: 'bold' },
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return '₦' + context.parsed.y.toLocaleString();
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 12 }, color: '#94A3B8' } },
                    y: { 
                        beginAtZero: true, 
                        border: { display: false },
                        grid: { color: '#E2E8F0', drawBorder: false },
                        ticks: { 
                            font: { size: 12 }, color: '#94A3B8',
                            callback: function(value) {
                                if (value >= 1000) return '₦' + (value/1000) + 'k';
                                return '₦' + value;
                            }
                        }
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('Error fetching chart data:', error);
    }
}

function initDashboardChart() {
    const controls = document.getElementById('chartRangeControls');
    if (!controls) return;
    
    // Initial load
    fetchDashboardChart(7);
    
    controls.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            document.querySelectorAll('#chartRangeControls .range-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const days = e.target.getAttribute('data-days');
            fetchDashboardChart(days);
        }
    });
}

// ANALYTICS FUNCTIONS
let chartInstances = {};

async function fetchAnalytics() {
    try {
        await Promise.all([
            loadSalesTrend(),
            loadExpenseBreakdown(),
            loadProfitTrend()
        ]);
    } catch (error) {
        console.error('Error fetching analytics:', error);
    }
}

async function loadSalesTrend() {
    const ctx = document.getElementById('salesTrendChart')?.getContext('2d');
    if (!ctx) return;
    
    const res = await fetch('/analytics/api/sales-trend');
    const data = await res.json();
    
    if (chartInstances['salesTrend']) chartInstances['salesTrend'].destroy();
    
    chartInstances['salesTrend'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Daily Revenue',
                data: data.data,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } }
        }
    });
}

async function loadExpenseBreakdown() {
    const ctx = document.getElementById('expenseBreakdownChart')?.getContext('2d');
    if (!ctx) return;
    
    const res = await fetch('/analytics/api/expense-breakdown');
    const data = await res.json();
    
    if (chartInstances['expenseBreakdown']) chartInstances['expenseBreakdown'].destroy();
    
    chartInstances['expenseBreakdown'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.labels,
            datasets: [{
                data: data.data,
                backgroundColor: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#64748b']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right' } }
        }
    });
}

async function loadProfitTrend() {
    const ctx = document.getElementById('profitTrendChart')?.getContext('2d');
    if (!ctx) return;
    
    const res = await fetch('/analytics/api/profit-trend');
    const data = await res.json();
    
    if (chartInstances['profitTrend']) chartInstances['profitTrend'].destroy();
    
    chartInstances['profitTrend'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'Revenue',
                    data: data.revenue,
                    backgroundColor: '#10b981'
                },
                {
                    label: 'Expenses',
                    data: data.expenses,
                    backgroundColor: '#ef4444'
                }
            ]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } }
        }
    });
}

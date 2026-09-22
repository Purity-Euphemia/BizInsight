// Global variables
let debounceTimeout;

// Debounce wrapper to prevent too many API calls while typing
function debounceFetchProducts() {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(fetchProducts, 300);
}

// Fetch products and populate table
async function fetchProducts() {
    const search = document.getElementById('searchInput')?.value || '';
    const category = document.getElementById('categoryFilter')?.value || '';
    
    try {
        const response = await fetch(`/products/api?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`);
        const products = await response.json();
        
        const tbody = document.getElementById('productTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (products.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No products found.</td></tr>';
            return;
        }

        products.forEach(p => {
            const tr = document.createElement('tr');
            
            // Determine stock status
            let statusHtml = `<span class="badge badge-success">In Stock</span>`;
            if (p.quantity === 0) {
                statusHtml = `<span class="badge badge-error">Out of Stock</span>`;
            } else if (p.quantity <= p.low_stock_limit) {
                statusHtml = `<span class="badge badge-warning">Low Stock</span>`;
            }

            tr.innerHTML = `
                <td>${escapeHtml(p.name)}</td>
                <td>${escapeHtml(p.category || '-')}</td>
                <td>$${p.buying_price.toFixed(2)}</td>
                <td>$${p.selling_price.toFixed(2)}</td>
                <td>${p.quantity}</td>
                <td>${statusHtml}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick='editProduct(${JSON.stringify(p).replace(/'/g, "&#39;")})'>Edit</button>
                    <button class="btn btn-sm btn-error" onclick="deleteProduct(${p.id})">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error fetching products:', error);
    }
}

// Save (Create or Update) Product
async function saveProduct(event) {
    event.preventDefault();
    
    const id = document.getElementById('productId').value;
    const url = id ? `/products/api/${id}` : '/products/api';
    const method = id ? 'PUT' : 'POST';
    
    const payload = {
        name: document.getElementById('name').value,
        category: document.getElementById('category').value,
        buying_price: parseFloat(document.getElementById('buying_price').value),
        selling_price: parseFloat(document.getElementById('selling_price').value),
        quantity: parseInt(document.getElementById('quantity').value, 10),
        low_stock_limit: parseInt(document.getElementById('low_stock_limit').value, 10)
    };

    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            closeProductModal();
            fetchProducts();
        } else {
            const errorDiv = document.getElementById('formError');
            errorDiv.textContent = result.error || 'Failed to save product';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Error saving product:', error);
    }
}

// Delete Product
async function deleteProduct(id) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    
    try {
        const response = await fetch(`/products/api/${id}`, { method: 'DELETE' });
        if (response.ok) {
            fetchProducts();
        } else {
            alert('Failed to delete product');
        }
    } catch (error) {
        console.error('Error deleting product:', error);
    }
}

// Modal Functions
function openProductModal() {
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    document.getElementById('modalTitle').textContent = 'Add Product';
    document.getElementById('formError').style.display = 'none';
    document.getElementById('productModal').style.display = 'block';
}

function closeProductModal() {
    document.getElementById('productModal').style.display = 'none';
}

function editProduct(product) {
    document.getElementById('productId').value = product.id;
    document.getElementById('name').value = product.name;
    document.getElementById('category').value = product.category || '';
    document.getElementById('buying_price').value = product.buying_price;
    document.getElementById('selling_price').value = product.selling_price;
    document.getElementById('quantity').value = product.quantity;
    document.getElementById('low_stock_limit').value = product.low_stock_limit;
    
    document.getElementById('modalTitle').textContent = 'Edit Product';
    document.getElementById('formError').style.display = 'none';
    document.getElementById('productModal').style.display = 'block';
}

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
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No products in inventory.</td></tr>';
            return;
        }

        data.items.forEach(p => {
            const tr = document.createElement('tr');
            
            let statusHtml = `<span class="badge badge-success">In Stock</span>`;
            if (p.status === 'Out of Stock') {
                statusHtml = `<span class="badge badge-error">Out of Stock</span>`;
            } else if (p.status === 'Low Stock') {
                statusHtml = `<span class="badge badge-warning">Low Stock</span>`;
            }

            tr.innerHTML = `
                <td>${escapeHtml(p.name)}</td>
                <td>${escapeHtml(p.category || '-')}</td>
                <td style="font-size: 1.2rem; font-weight: bold;">${p.quantity}</td>
                <td>${statusHtml}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="openAdjustModal(${p.id}, '${escapeHtml(p.name)}')">Adjust Stock</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
    } catch (error) {
        console.error('Error fetching inventory:', error);
    }
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
            <div class="product-card-price">$${p.selling_price.toFixed(2)}</div>
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

function changeCartQty(productId, delta) {
    const item = cart.find(i => i.product_id === productId);
    if (!item) return;
    
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
        cart = cart.filter(i => i.product_id !== productId);
    } else if (newQty > item.max_stock) {
        alert('Cannot exceed available stock.');
    } else {
        item.quantity = newQty;
    }
    renderCart();
}

function renderCart() {
    const cartEl = document.getElementById('cartItems');
    const totalEl = document.getElementById('cartTotal');
    const checkoutBtn = document.getElementById('checkoutBtn');
    
    if (!cartEl) return;
    
    cartEl.innerHTML = '';
    let total = 0;
    
    if (cart.length === 0) {
        cartEl.innerHTML = '<div class="text-center" style="color: #9ca3af; margin-top: 2rem;">Cart is empty</div>';
        totalEl.textContent = '$0.00';
        checkoutBtn.disabled = true;
        return;
    }
    
    cart.forEach(item => {
        const subtotal = item.unit_price * item.quantity;
        total += subtotal;
        
        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <div class="cart-item-info">
                <div class="cart-item-title">${escapeHtml(item.name)}</div>
                <div class="cart-item-price">$${item.unit_price.toFixed(2)} x ${item.quantity} = $${subtotal.toFixed(2)}</div>
            </div>
            <div class="cart-controls">
                <button class="cart-qty-btn" onclick="changeCartQty(${item.product_id}, -1)">-</button>
                <span class="cart-qty">${item.quantity}</span>
                <button class="cart-qty-btn" onclick="changeCartQty(${item.product_id}, 1)">+</button>
            </div>
        `;
        cartEl.appendChild(div);
    });
    
    totalEl.textContent = `$${total.toFixed(2)}`;
    checkoutBtn.disabled = false;
}

async function checkout() {
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
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No sales recorded yet.</td></tr>';
            return;
        }

        sales.forEach(s => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${s.id}</td>
                <td>${new Date(s.created_at).toLocaleString()}</td>
                <td>${escapeHtml(s.payment_method)}</td>
                <td style="font-weight:bold;">$${s.total_amount.toFixed(2)}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="viewReceipt(${s.id})">View Receipt</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error fetching sales history:', error);
    }
}

async function viewReceipt(saleId) {
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
                    <td style="text-align:right;">$${i.subtotal.toFixed(2)}</td>
                </tr>
            `;
        });
        
        html += `
            </table>
            <div style="border-top: 1px solid #ccc; padding-top: 0.5rem; display:flex; justify-content:space-between; font-weight:bold; font-size:1.1rem;">
                <span>Total</span>
                <span>$${data.sale.total_amount.toFixed(2)}</span>
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
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No customers found.</td></tr>';
        return;
    }
    
    filtered.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:bold;">${escapeHtml(c.name)}</td>
            <td>${escapeHtml(c.email || '-')}</td>
            <td>${escapeHtml(c.phone || '-')}</td>
            <td>${escapeHtml(c.address || '-')}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="viewCustomerHistory(${c.id})">History</button>
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

async function viewCustomerHistory(id) {
    try {
        const response = await fetch(`/customers/api/${id}/history`);
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error);
        
        document.getElementById('historyCustomerName').textContent = `Purchase History for ${data.customer_name}`;
        const tbody = document.getElementById('historyTableBody');
        tbody.innerHTML = '';
        
        if (data.sales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center">No purchases found.</td></tr>';
        } else {
            data.sales.forEach(s => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${new Date(s.created_at).toLocaleDateString()}</td>
                    <td style="font-weight:bold;">$${s.total_amount.toFixed(2)}</td>
                    <td>${escapeHtml(s.payment_method)}</td>
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
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No expenses found.</td></tr>';
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
        
        if (!response.ok) throw new Error(data.error);
        
        const m = data.metrics;
        
        document.getElementById('metric-revenue').textContent = `$${m.revenue.toFixed(2)}`;
        document.getElementById('metric-gross-profit').textContent = `$${m.gross_profit.toFixed(2)}`;
        document.getElementById('metric-expenses').textContent = `-$${m.expenses.toFixed(2)}`;
        
        const npEl = document.getElementById('metric-net-profit');
        npEl.textContent = `$${m.net_profit.toFixed(2)}`;
        if (m.net_profit < 0) {
            npEl.classList.add('text-error');
        } else {
            npEl.classList.remove('text-error');
            if (m.net_profit > 0) npEl.style.color = 'var(--success-color, #10b981)';
        }
        
        document.getElementById('metric-low-stock').textContent = m.low_stock_count;
        
        // Recent Sales
        const salesBody = document.getElementById('recentSalesBody');
        salesBody.innerHTML = '';
        if (data.recent_sales.length === 0) {
            salesBody.innerHTML = '<tr><td colspan="3" class="text-center">No recent sales.</td></tr>';
        } else {
            data.recent_sales.forEach(s => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>#${s.id}</td>
                    <td>${new Date(s.created_at).toLocaleDateString()}</td>
                    <td style="font-weight:bold;">$${s.total_amount.toFixed(2)}</td>
                `;
                salesBody.appendChild(tr);
            });
        }
        
        // Top Products
        const topBody = document.getElementById('topProductsBody');
        topBody.innerHTML = '';
        if (data.top_products.length === 0) {
            topBody.innerHTML = '<tr><td colspan="2" class="text-center">No sales data.</td></tr>';
        } else {
            data.top_products.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHtml(p.name)}</td>
                    <td style="font-weight:bold;">${p.total_sold} units</td>
                `;
                topBody.appendChild(tr);
            });
        }
        
    } catch (error) {
        console.error('Error fetching dashboard metrics:', error);
    }
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

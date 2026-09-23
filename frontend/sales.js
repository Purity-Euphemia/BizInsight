// Sales and POS logic for BizInsight

let currentPage = 1;
let currentSearch = '';
let currentDateFilter = '';
let currentStatusFilter = '';
let currentPaymentFilter = '';
let salesDebounceTimeout;
let posDebounceTimeout;

// POS State
let posProducts = [];
let cart = [];
let salesCustomers = [];
let activeSaleIdToCancel = null;

document.addEventListener('DOMContentLoaded', () => {
    fetchSalesMetrics();
    fetchSales(1);
});

// Utilities
function formatCurrency(amount) {
    return '₦' + parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
    return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute:'2-digit' });
}

// ----------------------------------------------------
// DASHBOARD VIEW
// ----------------------------------------------------

async function fetchSalesMetrics() {
    try {
        const res = await fetch('/sales/api/metrics');
        if (!res.ok) throw new Error('Failed to fetch metrics');
        const data = await res.json();
        
        document.getElementById('kpiTodaySales').textContent = data.today_sales;
        document.getElementById('kpiWeekSales').textContent = data.week_sales;
        document.getElementById('kpiMonthSales').textContent = data.month_sales;
        document.getElementById('kpiTotalProfit').textContent = formatCurrency(data.total_profit);
    } catch (e) {
        console.error('Metrics error:', e);
    }
}

async function fetchSales(page = currentPage) {
    currentPage = page;
    const tbody = document.getElementById('salesTableBody');
    tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding: 3rem;"><i class="fa-solid fa-spinner fa-spin fa-2x text-muted"></i></td></tr>';
    
    try {
        const url = `/sales/api?page=${page}&limit=10&search=${encodeURIComponent(currentSearch)}&date=${encodeURIComponent(currentDateFilter)}&status=${encodeURIComponent(currentStatusFilter)}&payment_method=${encodeURIComponent(currentPaymentFilter)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch sales');
        
        const data = await res.json();
        tbody.innerHTML = '';
        
        if (data.sales.length === 0) {
            let emptyMsg = "No sales found.";
            let emptyDesc = "Try adjusting your search or filters.";
            if (!currentSearch && !currentDateFilter && !currentStatusFilter && !currentPaymentFilter) {
                emptyMsg = "No sales yet";
                emptyDesc = "Record your first sale to start tracking your business performance.";
                tbody.innerHTML = `
                    <tr><td colspan="9" class="text-center" style="padding: 4rem 2rem;">
                        <i class="fa-solid fa-receipt" style="font-size: 3rem; color: var(--border-color); margin-bottom: 1rem;"></i>
                        <h4 style="color: var(--text-primary); margin-bottom: 0.5rem; font-size: 1.125rem;">${emptyMsg}</h4>
                        <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1.5rem;">${emptyDesc}</p>
                        <button class="btn btn-primary" onclick="toggleNewSaleView(true)"><i class="fa-solid fa-plus"></i> New Sale</button>
                    </td></tr>`;
            } else {
                tbody.innerHTML = `
                    <tr><td colspan="9" class="text-center" style="padding: 4rem 2rem;">
                        <i class="fa-solid fa-search" style="font-size: 3rem; color: var(--border-color); margin-bottom: 1rem;"></i>
                        <h4 style="color: var(--text-primary); margin-bottom: 0.5rem; font-size: 1.125rem;">${emptyMsg}</h4>
                        <p style="color: var(--text-secondary); font-size: 0.875rem;">${emptyDesc}</p>
                    </td></tr>`;
            }
        } else {
            data.sales.forEach(s => {
                const tr = document.createElement('tr');
                
                let badgeClass = 'badge-success';
                if (s.status === 'Cancelled') badgeClass = 'badge-danger';
                
                tr.innerHTML = `
                    <td style="font-weight: 500;">#${s.id}</td>
                    <td>${escapeHtml(s.customer_name || 'Walk-in Customer')}</td>
                    <td>${s.total_items || 0}</td>
                    <td style="font-weight: 600;">${formatCurrency(s.total_amount)}</td>
                    <td><span class="badge badge-neutral">${s.payment_method}</span></td>
                    <td style="color: var(--status-success); font-weight: 500;">${formatCurrency(s.profit)}</td>
                    <td style="color: var(--text-secondary); font-size: 0.875rem;">${formatDate(s.created_at)}</td>
                    <td><span class="badge ${badgeClass}">${s.status}</span></td>
                    <td style="text-align: right;">
                        <button class="btn btn-sm btn-secondary" onclick="openSaleDetails(${s.id})">View Details</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
        
        renderPagination(data.page, data.total_pages, data.total);
    } catch (e) {
        console.error('Fetch sales error:', e);
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger" style="padding: 2rem;">Unable to load sales. Please try again. <button class="btn btn-sm btn-secondary" style="margin-left: 1rem;" onclick="fetchSales()">Retry</button></td></tr>`;
    }
}

function renderPagination(page, totalPages, totalItems) {
    const info = document.getElementById('paginationInfo');
    const buttons = document.getElementById('paginationButtons');
    
    if (totalItems === 0) {
        info.textContent = 'Showing 0 to 0 of 0 entries';
        buttons.innerHTML = '';
        return;
    }
    
    const start = (page - 1) * 10 + 1;
    const end = Math.min(page * 10, totalItems);
    info.textContent = `Showing ${start} to ${end} of ${totalItems} entries`;
    
    let btnsHtml = '';
    btnsHtml += `<button class="btn btn-sm btn-secondary" ${page === 1 ? 'disabled' : ''} onclick="fetchSales(${page - 1})">Previous</button>`;
    btnsHtml += `<span style="padding: 0.25rem 0.75rem; background: var(--bg-main); border-radius: var(--radius-sm); font-weight: 500; font-size: 0.875rem;">Page ${page}</span>`;
    btnsHtml += `<button class="btn btn-sm btn-secondary" ${page === totalPages ? 'disabled' : ''} onclick="fetchSales(${page + 1})">Next</button>`;
    
    buttons.innerHTML = btnsHtml;
}

// Filters listeners
function debounceFetchSales() {
    clearTimeout(salesDebounceTimeout);
    currentSearch = document.getElementById('salesSearch').value;
    salesDebounceTimeout = setTimeout(() => fetchSales(1), 300);
}

document.getElementById('salesDateRange').addEventListener('change', (e) => { currentDateFilter = e.target.value; fetchSales(1); });
document.getElementById('salesPaymentMethod').addEventListener('change', (e) => { currentPaymentFilter = e.target.value; fetchSales(1); });
document.getElementById('salesStatus').addEventListener('change', (e) => { currentStatusFilter = e.target.value; fetchSales(1); });


// ----------------------------------------------------
// NEW SALE (POS) LOGIC
// ----------------------------------------------------

function toggleNewSaleView(show) {
    document.getElementById('salesDashboardView').style.display = show ? 'none' : 'block';
    document.getElementById('newSaleView').style.display = show ? 'block' : 'none';
    
    if (show) {
        cart = [];
        document.getElementById('saleDiscount').value = "0";
        document.getElementById('checkoutError').style.display = 'none';
        updateCartDisplay();
        fetchPOSData();
    } else {
        // Refresh dashboard on return
        fetchSalesMetrics();
        fetchSales(currentPage);
    }
}

async function fetchPOSData() {
    document.getElementById('posProductsGrid').innerHTML = '<div style="grid-column: 1/-1; padding: 2rem; text-align: center;"><i class="fa-solid fa-spinner fa-spin fa-2x text-muted"></i></div>';
    
    try {
        // Fetch active products
        const resP = await fetch('/products/api?limit=100'); // Fetch enough for POS
        if (resP.ok) {
            const dataP = await resP.json();
            posProducts = dataP.products;
            renderPOSProducts();
        }
        
        // Fetch customers
        const resC = await fetch('/customers/api?limit=100');
        if (resC.ok) {
            const dataC = await resC.json();
            salesCustomers = dataC.customers || dataC; // Handle depending on if paginated
            const select = document.getElementById('saleCustomer');
            select.innerHTML = '<option value="">Walk-in Customer</option>';
            
            // Handle if the response is an array directly or an object with .customers
            const customerArray = Array.isArray(salesCustomers) ? salesCustomers : (salesCustomers.customers || []);
            
            customerArray.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = `${c.name} (${c.phone || c.email || 'No contact'})`;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('POS Data Error:', e);
        document.getElementById('posProductsGrid').innerHTML = '<div style="grid-column: 1/-1; color: var(--status-danger);">Failed to load products.</div>';
    }
}

function debouncePOSSearch() {
    clearTimeout(posDebounceTimeout);
    posDebounceTimeout = setTimeout(renderPOSProducts, 300);
}

function renderPOSProducts() {
    const grid = document.getElementById('posProductsGrid');
    const search = document.getElementById('posProductSearch').value.toLowerCase();
    
    grid.innerHTML = '';
    
    let count = 0;
    posProducts.forEach(p => {
        if (search && !p.name.toLowerCase().includes(search) && (!p.category || !p.category.toLowerCase().includes(search))) return;
        
        const isOutOfStock = p.quantity <= 0;
        
        const card = document.createElement('div');
        card.className = `pos-product-card ${isOutOfStock ? 'disabled' : ''}`;
        card.onclick = () => { if (!isOutOfStock) addToCart(p); };
        
        card.innerHTML = `
            <div style="font-weight: 500; margin-bottom: 0.25rem;">${escapeHtml(p.name)}</div>
            <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">${escapeHtml(p.category || 'Uncategorized')}</div>
            <div class="flex-between align-center">
                <span style="font-weight: 600; color: var(--brand-blue);">${formatCurrency(p.selling_price)}</span>
                <span style="font-size: 0.75rem; padding: 0.125rem 0.375rem; border-radius: var(--radius-sm); ${isOutOfStock ? 'background: #fee2e2; color: var(--status-danger);' : 'background: #e0e7ff; color: var(--brand-blue);'}">
                    Stock: ${p.quantity}
                </span>
            </div>
        `;
        grid.appendChild(card);
        count++;
    });
    
    if (count === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; padding: 2rem; text-align: center; color: var(--text-secondary);">No products match your search.</div>`;
    }
}

function addToCart(product) {
    const existing = cart.find(i => i.product_id === product.id);
    
    if (existing) {
        if (existing.quantity >= product.quantity) {
            alert(`Insufficient stock. Only ${product.quantity} units are currently available.`);
            return;
        }
        existing.quantity += 1;
    } else {
        cart.push({
            product_id: product.id,
            name: product.name,
            unit_price: product.selling_price,
            quantity: 1,
            max_qty: product.quantity
        });
    }
    
    updateCartDisplay();
}

function updateCartQty(productId, delta) {
    const item = cart.find(i => i.product_id === productId);
    if (!item) return;
    
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
        removeFromCart(productId);
        return;
    }
    
    if (newQty > item.max_qty) {
        alert(`Insufficient stock. Only ${item.max_qty} units are currently available.`);
        return;
    }
    
    item.quantity = newQty;
    updateCartDisplay();
}

function removeFromCart(productId) {
    cart = cart.filter(i => i.product_id !== productId);
    updateCartDisplay();
}

function updateCartDisplay() {
    const container = document.getElementById('cartItems');
    const btnComplete = document.getElementById('btnCompleteSale');
    
    if (cart.length === 0) {
        container.innerHTML = `
            <div class="text-center" style="padding: 2rem; color: var(--text-secondary);">
                <i class="fa-solid fa-cart-shopping" style="font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.5;"></i>
                <p style="font-size: 0.875rem;">No items added yet</p>
            </div>
        `;
        btnComplete.disabled = true;
    } else {
        container.innerHTML = '';
        cart.forEach(item => {
            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <div style="flex: 1;">
                    <div style="font-weight: 500; font-size: 0.875rem;">${escapeHtml(item.name)}</div>
                    <div style="color: var(--brand-blue); font-size: 0.875rem;">${formatCurrency(item.unit_price)}</div>
                </div>
                <div class="qty-control">
                    <button class="qty-btn" onclick="updateCartQty(${item.product_id}, -1)">-</button>
                    <span style="width: 20px; text-align: center; font-size: 0.875rem; font-weight: 500;">${item.quantity}</span>
                    <button class="qty-btn" onclick="updateCartQty(${item.product_id}, 1)">+</button>
                </div>
                <div style="text-align: right; margin-left: 1rem;">
                    <div style="font-weight: 600; font-size: 0.875rem;">${formatCurrency(item.unit_price * item.quantity)}</div>
                    <button class="btn btn-sm" style="color: var(--status-danger); padding: 0; background: none; font-size: 0.75rem;" onclick="removeFromCart(${item.product_id})">Remove</button>
                </div>
            `;
            container.appendChild(container.lastElementChild ? container.insertBefore(div, null) : div);
        });
        btnComplete.disabled = false;
    }
    
    updateCartTotals();
}

function updateCartTotals() {
    let subtotal = 0;
    cart.forEach(i => subtotal += (i.unit_price * i.quantity));
    
    const discountInput = document.getElementById('saleDiscount').value;
    let discount = parseFloat(discountInput);
    if (isNaN(discount) || discount < 0) discount = 0;
    
    let total = subtotal - discount;
    if (total < 0) total = 0;
    
    document.getElementById('saleSubtotal').textContent = formatCurrency(subtotal);
    document.getElementById('saleTotal').textContent = formatCurrency(total);
}

async function completeSale() {
    if (cart.length === 0) return;
    
    const errDiv = document.getElementById('checkoutError');
    errDiv.style.display = 'none';
    
    const btnComplete = document.getElementById('btnCompleteSale');
    btnComplete.disabled = true;
    btnComplete.textContent = 'Processing...';
    
    let discount = parseFloat(document.getElementById('saleDiscount').value) || 0;
    
    const payload = {
        items: cart,
        payment_method: document.getElementById('salePaymentMethod').value,
        customer_id: document.getElementById('saleCustomer').value || null,
        discount: discount
    };
    
    try {
        const res = await fetch('/sales/api/checkout', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.error || 'Unable to complete this sale. Your inventory and account were not changed.');
        }
        
        // Success
        alert(`Sale #${data.sale_id} completed successfully!`);
        toggleNewSaleView(false);
        
    } catch (e) {
        errDiv.textContent = e.message;
        errDiv.style.display = 'block';
        btnComplete.disabled = false;
        btnComplete.textContent = 'Complete Sale';
    }
}


// ----------------------------------------------------
// SALE DETAILS & RECEIPT
// ----------------------------------------------------

let currentReceiptHtml = '';

async function openSaleDetails(saleId) {
    document.getElementById('saleDetailsModal').style.display = 'flex';
    document.getElementById('detailsSaleId').textContent = `Sale #${saleId}`;
    const content = document.getElementById('saleDetailsContent');
    content.innerHTML = '<div class="text-center" style="padding: 2rem;"><i class="fa-solid fa-spinner fa-spin fa-2x text-muted"></i></div>';
    
    const btnCancel = document.getElementById('btnCancelSale');
    btnCancel.style.display = 'none';
    
    try {
        const res = await fetch(`/sales/api/${saleId}`);
        if (!res.ok) throw new Error('Sale not found');
        const data = await res.json();
        const s = data.sale;
        
        if (s.status === 'Completed') {
            btnCancel.style.display = 'block';
            activeSaleIdToCancel = saleId;
        }
        
        let html = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; background: var(--bg-main); padding: 1rem; border-radius: var(--radius-md);">
                <div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">Date</div>
                    <div style="font-weight: 500;">${formatDate(s.created_at)}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">Customer</div>
                    <div style="font-weight: 500;">${escapeHtml(s.customer_name || 'Walk-in Customer')}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">Payment Method</div>
                    <div style="font-weight: 500;">${s.payment_method}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">Status</div>
                    <div><span class="badge ${s.status === 'Completed' ? 'badge-success' : 'badge-danger'}">${s.status}</span></div>
                </div>
            </div>
            
            <h4 style="margin-bottom: 0.5rem; font-size: 1rem;">Order Items</h4>
            <table class="data-table" style="margin-bottom: 1.5rem; font-size: 0.875rem;">
                <thead>
                    <tr>
                        <th>Product</th>
                        <th style="text-align: right;">Price</th>
                        <th style="text-align: center;">Qty</th>
                        <th style="text-align: right;">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        let rawSubtotal = 0;
        data.items.forEach(i => {
            rawSubtotal += i.subtotal;
            html += `
                <tr>
                    <td>${escapeHtml(i.product_name)}</td>
                    <td style="text-align: right;">${formatCurrency(i.unit_price)}</td>
                    <td style="text-align: center;">${i.quantity}</td>
                    <td style="text-align: right; font-weight: 500;">${formatCurrency(i.subtotal)}</td>
                </tr>
            `;
        });
        
        html += `</tbody></table>
            <div style="display: flex; justify-content: flex-end;">
                <div style="width: 250px;">
                    <div class="flex-between" style="margin-bottom: 0.5rem; font-size: 0.875rem;">
                        <span style="color: var(--text-secondary);">Subtotal</span>
                        <span>${formatCurrency(rawSubtotal)}</span>
                    </div>
                    <div class="flex-between" style="margin-bottom: 0.5rem; font-size: 0.875rem;">
                        <span style="color: var(--text-secondary);">Discount</span>
                        <span>${formatCurrency(s.discount)}</span>
                    </div>
                    <div style="height: 1px; background: var(--border-color); margin: 0.5rem 0;"></div>
                    <div class="flex-between" style="margin-bottom: 0.5rem; font-size: 1.125rem; font-weight: 600;">
                        <span>Total Paid</span>
                        <span style="color: var(--brand-blue);">${formatCurrency(s.total_amount)}</span>
                    </div>
                    ${s.status === 'Completed' ? `
                    <div class="flex-between" style="margin-top: 1rem; padding-top: 0.5rem; border-top: 1px dashed var(--border-color); font-size: 0.875rem;">
                        <span style="color: var(--status-success);"><i class="fa-solid fa-arrow-trend-up"></i> Net Profit</span>
                        <span style="color: var(--status-success); font-weight: 600;">${formatCurrency(s.profit)}</span>
                    </div>` : ''}
                </div>
            </div>
        `;
        
        content.innerHTML = html;
        
        // Build Receipt HTML for printing
        let receiptHtml = `
            <div style="max-width: 300px; margin: 0 auto; text-align: center;">
                <h2>BizInsight</h2>
                <p>Sale #${s.id}<br>${formatDate(s.created_at)}</p>
                <hr style="border:1px dashed #000; margin: 10px 0;">
                <p>Customer: ${escapeHtml(s.customer_name || 'Walk-in')}</p>
                <hr style="border:1px dashed #000; margin: 10px 0;">
                <table style="width: 100%; text-align: left; font-size: 14px;">
        `;
        
        data.items.forEach(i => {
            receiptHtml += `
                <tr>
                    <td colspan="3">${escapeHtml(i.product_name)}</td>
                </tr>
                <tr>
                    <td>${i.quantity} x ${parseFloat(i.unit_price).toLocaleString('en-NG')}</td>
                    <td style="text-align: right;" colspan="2">${parseFloat(i.subtotal).toLocaleString('en-NG')}</td>
                </tr>
            `;
        });
        
        receiptHtml += `
                </table>
                <hr style="border:1px dashed #000; margin: 10px 0;">
                <div style="display: flex; justify-content: space-between; font-size: 14px;">
                    <span>Subtotal:</span>
                    <span>${parseFloat(rawSubtotal).toLocaleString('en-NG')}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 14px;">
                    <span>Discount:</span>
                    <span>${parseFloat(s.discount).toLocaleString('en-NG')}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; margin-top: 5px;">
                    <span>Total:</span>
                    <span>₦${parseFloat(s.total_amount).toLocaleString('en-NG')}</span>
                </div>
                <hr style="border:1px dashed #000; margin: 10px 0;">
                <p>Payment: ${s.payment_method}</p>
                <p>Thank you for your business!</p>
            </div>
        `;
        document.getElementById('printReceiptContainer').innerHTML = receiptHtml;
        
    } catch (e) {
        content.innerHTML = `<div class="alert alert-danger" style="margin: 1rem;">${e.message}</div>`;
    }
}

function closeSaleDetailsModal() {
    document.getElementById('saleDetailsModal').style.display = 'none';
    activeSaleIdToCancel = null;
}

function printReceipt() {
    window.print();
}

async function cancelSale() {
    if (!activeSaleIdToCancel) return;
    
    if (!confirm("Are you sure you want to cancel this sale? This will restore the inventory and reverse the revenue/profit. This action cannot be undone.")) {
        return;
    }
    
    const btn = document.getElementById('btnCancelSale');
    btn.disabled = true;
    btn.textContent = 'Cancelling...';
    
    try {
        const res = await fetch(`/sales/api/${activeSaleIdToCancel}/cancel`, { method: 'POST' });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || 'Failed to cancel sale');
        
        alert(`Sale #${activeSaleIdToCancel} has been cancelled successfully.`);
        closeSaleDetailsModal();
        fetchSalesMetrics();
        fetchSales(currentPage);
        
    } catch (e) {
        alert(e.message);
        btn.disabled = false;
        btn.textContent = 'Cancel Sale';
    }
}

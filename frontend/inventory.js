// Inventory logic for BizInsight

let currentPage = 1;
let currentSearch = '';
let currentCategory = '';
let currentStatus = '';
let currentSort = 'name_asc';
let inventoryDebounceTimeout;
let productList = []; // To store lightweight product references for the dropdown

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    fetchInventoryMetrics();
    fetchInventory(1);
});

// Format currency
function formatCurrency(amount) {
    return '₦' + parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Fetch metrics and visual overview
async function fetchInventoryMetrics() {
    try {
        const response = await fetch('/inventory/api/metrics');
        if (!response.ok) throw new Error('Failed to fetch metrics');
        const data = await response.json();
        
        document.getElementById('kpiTotalProducts').textContent = data.total_products;
        document.getElementById('kpiLowStock').textContent = data.low_stock;
        document.getElementById('kpiOutOfStock').textContent = data.out_of_stock;
        document.getElementById('kpiInventoryValue').textContent = formatCurrency(data.inventory_value);
        
        // Update visual overview
        const overviewSection = document.getElementById('stockOverviewSection');
        if (data.total_products > 0) {
            overviewSection.style.display = 'block';
            
            const total = data.total_products;
            const outOfStock = data.out_of_stock;
            const lowStock = data.low_stock;
            const healthy = total - outOfStock - lowStock;
            
            const pctHealthy = (healthy / total) * 100;
            const pctLow = (lowStock / total) * 100;
            const pctOut = (outOfStock / total) * 100;
            
            document.getElementById('barHealthy').style.width = `${pctHealthy}%`;
            document.getElementById('barLow').style.width = `${pctLow}%`;
            document.getElementById('barOut').style.width = `${pctOut}%`;
            
            document.getElementById('labelHealthy').textContent = `Healthy (${Math.round(pctHealthy)}%)`;
            document.getElementById('labelLow').textContent = `Low Stock (${Math.round(pctLow)}%)`;
            document.getElementById('labelOut').textContent = `Out of Stock (${Math.round(pctOut)}%)`;
        } else {
            overviewSection.style.display = 'none';
        }
        
    } catch (error) {
        console.error('Metrics error:', error);
    }
}

// Fetch and render inventory table
async function fetchInventory(page = currentPage) {
    currentPage = page;
    const tbody = document.getElementById('inventoryTableBody');
    tbody.innerHTML = '<tr><td colspan="10" class="text-center" style="padding: 3rem;"><i class="fa-solid fa-spinner fa-spin fa-2x text-muted"></i></td></tr>';
    
    try {
        const url = `/inventory/api?page=${page}&limit=10&search=${encodeURIComponent(currentSearch)}&category=${encodeURIComponent(currentCategory)}&stock_status=${encodeURIComponent(currentStatus)}&sort_by=${encodeURIComponent(currentSort)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch inventory');
        
        const data = await response.json();
        tbody.innerHTML = '';
        
        // Cache products for the adjustment dropdown
        if (page === 1 && !currentSearch && !currentCategory && !currentStatus) {
            // Usually we'd want all products for the dropdown, but we'll extract them as they load
            // Or ideally have a separate lightweight endpoint for dropdowns. 
            // We'll dynamically populate the dropdown with loaded products for now.
        }
        
        if (data.products.length === 0) {
            let emptyMsg = "No inventory found.";
            let emptyDesc = "Try adjusting your filters or search query.";
            if (!currentSearch && !currentCategory && !currentStatus) {
                emptyMsg = "No inventory yet";
                emptyDesc = "Add products to start tracking your stock levels.";
                tbody.innerHTML = `
                    <tr><td colspan="10" class="text-center" style="padding: 4rem 2rem;">
                        <i class="fa-solid fa-boxes-stacked" style="font-size: 3rem; color: var(--border-color); margin-bottom: 1rem;"></i>
                        <h4 style="color: var(--text-primary); margin-bottom: 0.5rem; font-size: 1.125rem;">${emptyMsg}</h4>
                        <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1.5rem;">${emptyDesc}</p>
                        <a href="/products" class="btn btn-primary">Add Product</a>
                    </td></tr>`;
            } else {
                tbody.innerHTML = `
                    <tr><td colspan="10" class="text-center" style="padding: 4rem 2rem;">
                        <i class="fa-solid fa-box-open" style="font-size: 3rem; color: var(--border-color); margin-bottom: 1rem;"></i>
                        <h4 style="color: var(--text-primary); margin-bottom: 0.5rem; font-size: 1.125rem;">${emptyMsg}</h4>
                        <p style="color: var(--text-secondary); font-size: 0.875rem;">${emptyDesc}</p>
                    </td></tr>`;
            }
        } else {
            data.products.forEach(p => {
                const tr = document.createElement('tr');
                
                let stockStatus = 'healthy';
                let badgeClass = 'badge-success';
                let statusText = 'Healthy';
                
                if (p.quantity === 0) {
                    stockStatus = 'out';
                    badgeClass = 'badge-danger';
                    statusText = 'Out of Stock';
                } else if (p.quantity <= p.low_stock_limit) {
                    stockStatus = 'low';
                    badgeClass = 'badge-warning';
                    statusText = 'Low Stock';
                }
                
                const updatedDate = new Date(p.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const invValue = p.buying_price * p.quantity;
                
                tr.innerHTML = `
                    <td>
                        <div style="font-weight: 500;">${escapeHtml(p.name)}</div>
                    </td>
                    <td><span class="badge badge-neutral">${escapeHtml(p.category || '-')}</span></td>
                    <td>${formatCurrency(p.buying_price)}</td>
                    <td>${formatCurrency(p.selling_price)}</td>
                    <td style="font-weight: 600; font-size: 1.125rem;">${p.quantity}</td>
                    <td style="color: var(--text-secondary);">${p.low_stock_limit}</td>
                    <td style="font-weight: 500;">${formatCurrency(invValue)}</td>
                    <td><span class="badge ${badgeClass}">${statusText}</span></td>
                    <td style="color: var(--text-secondary); font-size: 0.875rem;">${updatedDate}</td>
                    <td style="text-align: right;">
                        <div class="dropdown" style="display: inline-block;">
                            <button class="btn btn-sm btn-secondary" onclick="toggleDropdown(event, ${p.id})">
                                Actions <i class="fa-solid fa-chevron-down" style="font-size: 0.75rem; margin-left: 0.25rem;"></i>
                            </button>
                            <div class="dropdown-menu" id="dropdown-${p.id}" style="display: none; position: absolute; right: 0; background: white; border: 1px solid var(--border-color); border-radius: var(--radius-sm); box-shadow: var(--shadow-dropdown); z-index: 100; min-width: 140px; text-align: left;">
                                <a href="#" onclick="openStockHistoryModal(${p.id}, '${escapeHtml(p.name)}'); return false;"><i class="fa-solid fa-clock-rotate-left fa-fw" style="color: var(--text-secondary); margin-right: 0.5rem;"></i> History</a>
                                <a href="#" onclick="openAdjustStockModal(${p.id}, '${escapeHtml(p.name)}', ${p.quantity}); return false;"><i class="fa-solid fa-plus-minus fa-fw" style="color: var(--brand-blue); margin-right: 0.5rem;"></i> Adjust Stock</a>
                            </div>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            
            populateCategories(data.products);
            populateProductDropdown(data.products);
        }
        
        renderPagination(data.page, data.total_pages, data.total);
    } catch (error) {
        console.error('Inventory error:', error);
        tbody.innerHTML = `<tr><td colspan="10" class="text-center text-danger" style="padding: 2rem;">Unable to load inventory. Please try again. <button class="btn btn-sm btn-secondary" style="margin-left: 1rem;" onclick="fetchInventory()">Retry</button></td></tr>`;
    }
}

function toggleDropdown(event, id) {
    event.stopPropagation();
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
        if (menu.id !== `dropdown-${id}`) menu.style.display = 'none';
    });
    const menu = document.getElementById(`dropdown-${id}`);
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu').forEach(menu => menu.style.display = 'none');
});

function debounceFetchInventory() {
    clearTimeout(inventoryDebounceTimeout);
    currentSearch = document.getElementById('inventorySearch').value;
    inventoryDebounceTimeout = setTimeout(() => fetchInventory(1), 300);
}

document.getElementById('inventoryCategory').addEventListener('change', (e) => {
    currentCategory = e.target.value;
    fetchInventory(1);
});

document.getElementById('inventoryStockStatus').addEventListener('change', (e) => {
    currentStatus = e.target.value;
    fetchInventory(1);
});

document.getElementById('inventorySort').addEventListener('change', (e) => {
    currentSort = e.target.value;
    fetchInventory(1);
});

function populateCategories(products) {
    const select = document.getElementById('inventoryCategory');
    const existingCats = new Set(Array.from(select.options).map(o => o.value));
    
    products.forEach(p => {
        if (p.category && !existingCats.has(p.category)) {
            existingCats.add(p.category);
            const opt = document.createElement('option');
            opt.value = p.category;
            opt.textContent = p.category;
            select.appendChild(opt);
        }
    });
}

// In a real app, you'd fetch all lightweight products for the dropdown. 
// We append them dynamically as they appear in the paginated list to avoid a heavy request.
const knownProductsMap = new Map();

function populateProductDropdown(products) {
    const select = document.getElementById('adjustProductSelect');
    
    products.forEach(p => {
        if (!knownProductsMap.has(p.id)) {
            knownProductsMap.set(p.id, p);
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            opt.dataset.stock = p.quantity;
            select.appendChild(opt);
        } else {
            // Update stock if it changed
            knownProductsMap.get(p.id).quantity = p.quantity;
            const opt = select.querySelector(`option[value="${p.id}"]`);
            if (opt) opt.dataset.stock = p.quantity;
        }
    });
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
    btnsHtml += `<button class="btn btn-sm btn-secondary" ${page === 1 ? 'disabled' : ''} onclick="fetchInventory(${page - 1})">Previous</button>`;
    btnsHtml += `<span style="padding: 0.25rem 0.75rem; background: var(--bg-main); border-radius: var(--radius-sm); font-weight: 500; font-size: 0.875rem;">Page ${page}</span>`;
    btnsHtml += `<button class="btn btn-sm btn-secondary" ${page === totalPages ? 'disabled' : ''} onclick="fetchInventory(${page + 1})">Next</button>`;
    
    buttons.innerHTML = btnsHtml;
}

// Adjustment Modal
function openAdjustStockModal(productId = null, productName = null, currentStock = null) {
    document.getElementById('adjustStockForm').reset();
    document.getElementById('adjustStockError').style.display = 'none';
    
    const productSelect = document.getElementById('adjustProductSelect');
    
    if (productId) {
        // Find if it exists in options
        let optionExists = false;
        Array.from(productSelect.options).forEach(opt => {
            if (opt.value == productId) {
                optionExists = true;
                opt.dataset.stock = currentStock;
            }
        });
        
        if (!optionExists) {
            const opt = document.createElement('option');
            opt.value = productId;
            opt.textContent = productName;
            opt.dataset.stock = currentStock;
            productSelect.appendChild(opt);
        }
        
        productSelect.value = productId;
        productSelect.disabled = true; // Lock it if accessed from row action
    } else {
        productSelect.value = "";
        productSelect.disabled = false;
    }
    
    onAdjustProductChange(); // Trigger preview update
    document.getElementById('adjustStockModal').style.display = 'flex';
}

function closeAdjustStockModal() {
    document.getElementById('adjustStockModal').style.display = 'none';
}

function onAdjustProductChange() {
    const select = document.getElementById('adjustProductSelect');
    const typeSelect = document.getElementById('adjustType');
    
    if (!select.value) {
        document.getElementById('adjustCurrentStock').textContent = '--';
        document.getElementById('adjustNewStock').textContent = '--';
        return;
    }
    
    const selectedOption = select.options[select.selectedIndex];
    const currentStock = parseInt(selectedOption.dataset.stock || 0, 10);
    document.getElementById('adjustCurrentStock').textContent = currentStock;
    
    calculateNewStockPreview();
}

function calculateNewStockPreview() {
    const select = document.getElementById('adjustProductSelect');
    if (!select.value) return;
    
    const selectedOption = select.options[select.selectedIndex];
    const currentStock = parseInt(selectedOption.dataset.stock || 0, 10);
    
    const type = document.getElementById('adjustType').value;
    const qtyInput = document.getElementById('adjustQuantity').value;
    const qty = parseInt(qtyInput || 0, 10);
    
    let newStock = currentStock;
    if (qty > 0) {
        if (type === 'IN') newStock += qty;
        else newStock -= qty;
    }
    
    const newStockEl = document.getElementById('adjustNewStock');
    newStockEl.textContent = newStock;
    
    if (newStock < 0) {
        newStockEl.style.color = 'var(--status-danger)';
    } else {
        newStockEl.style.color = 'var(--brand-blue)';
    }
}

async function saveStockAdjustment(event) {
    event.preventDefault();
    const btn = document.getElementById('saveAdjustmentBtn');
    const errDiv = document.getElementById('adjustStockError');
    errDiv.style.display = 'none';
    
    const productId = document.getElementById('adjustProductSelect').value;
    const type = document.getElementById('adjustType').value;
    const quantity = parseInt(document.getElementById('adjustQuantity').value, 10);
    const reference = document.getElementById('adjustReference').value;
    
    if (!productId) {
        errDiv.textContent = 'Please select a product.';
        errDiv.style.display = 'block';
        return;
    }
    
    // Check local negative validation
    const select = document.getElementById('adjustProductSelect');
    const selectedOption = select.options[select.selectedIndex];
    const currentStock = parseInt(selectedOption.dataset.stock || 0, 10);
    if (type === 'OUT' && (currentStock - quantity) < 0) {
        errDiv.textContent = 'Insufficient stock. Cannot remove more than available.';
        errDiv.style.display = 'block';
        return;
    }
    
    btn.disabled = true;
    btn.textContent = 'Saving...';
    
    try {
        const response = await fetch('/inventory/api/adjust', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                product_id: productId,
                transaction_type: type,
                quantity: quantity,
                reference: reference
            })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to adjust stock');
        
        // Update local cache
        selectedOption.dataset.stock = data.new_quantity;
        
        closeAdjustStockModal();
        fetchInventory(currentPage);
        fetchInventoryMetrics();
    } catch (error) {
        errDiv.textContent = error.message;
        errDiv.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirm';
    }
}

// History Modal
async function openStockHistoryModal(productId, productName) {
    document.getElementById('historyProductName').textContent = productName;
    const content = document.getElementById('stockHistoryContent');
    content.innerHTML = '<div class="text-center" style="padding: 2rem;"><i class="fa-solid fa-spinner fa-spin fa-2x text-muted"></i></div>';
    document.getElementById('stockHistoryModal').style.display = 'flex';
    
    try {
        const response = await fetch(`/inventory/api/history/${productId}`);
        if (!response.ok) throw new Error('Failed to load history');
        const data = await response.json();
        
        if (data.length === 0) {
            content.innerHTML = `
                <div class="empty-state" style="padding: 2rem;">
                    <i class="fa-solid fa-clock-rotate-left empty-icon"></i>
                    <h3 class="empty-title">No History</h3>
                    <p class="empty-desc">There are no inventory transactions for this product yet.</p>
                </div>
            `;
            return;
        }
        
        let html = `
            <table class="data-table" style="font-size: 0.875rem;">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th style="text-align: right;">Prev</th>
                        <th style="text-align: right;">Qty</th>
                        <th style="text-align: right;">New</th>
                        <th>Reference</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        data.forEach(t => {
            const date = new Date(t.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            
            let typeBadge = '';
            let qtyStr = '';
            if (t.transaction_type === 'IN') {
                typeBadge = '<span class="badge badge-success">Stock Added</span>';
                qtyStr = `<span style="color: var(--status-success);">+${t.quantity}</span>`;
            } else {
                if (t.reference && t.reference.startsWith('Sale')) {
                    typeBadge = '<span class="badge badge-neutral">Sale</span>';
                } else {
                    typeBadge = '<span class="badge badge-warning">Adjustment (Out)</span>';
                }
                qtyStr = `<span style="color: var(--status-danger);">-${t.quantity}</span>`;
            }
            
            html += `
                <tr>
                    <td style="color: var(--text-secondary);">${date}</td>
                    <td>${typeBadge}</td>
                    <td style="text-align: right; color: var(--text-secondary);">${t.previous_stock}</td>
                    <td style="text-align: right; font-weight: 500;">${qtyStr}</td>
                    <td style="text-align: right; font-weight: 600;">${t.new_stock}</td>
                    <td style="color: var(--text-secondary); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(t.reference || '')}">${escapeHtml(t.reference || '-')}</td>
                </tr>
            `;
        });
        
        html += `</tbody></table>`;
        content.innerHTML = html;
        
    } catch (error) {
        content.innerHTML = `<div class="alert alert-danger" style="margin: 1rem;">${error.message}</div>`;
    }
}

function closeStockHistoryModal() {
    document.getElementById('stockHistoryModal').style.display = 'none';
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

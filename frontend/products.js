// Products logic for BizInsight

let currentPage = 1;
let currentSearch = '';
let currentCategory = '';
let currentStatus = '';
let currentSort = 'name_asc';
let productDebounceTimeout;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    fetchProductMetrics();
    fetchProducts(1);
});

// Format currency
function formatCurrency(amount) {
    return '₦' + parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Fetch metrics for KPI cards
async function fetchProductMetrics() {
    try {
        const response = await fetch('/products/api/metrics');
        if (!response.ok) throw new Error('Failed to fetch metrics');
        const data = await response.json();
        
        document.getElementById('kpiTotalProducts').textContent = data.total_products;
        document.getElementById('kpiLowStock').textContent = data.low_stock;
        document.getElementById('kpiOutOfStock').textContent = data.out_of_stock;
        document.getElementById('kpiInventoryValue').textContent = formatCurrency(data.inventory_value);
    } catch (error) {
        console.error('Metrics error:', error);
    }
}

// Fetch and render products table
async function fetchProducts(page = currentPage) {
    currentPage = page;
    const tbody = document.getElementById('productTableBody');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 3rem;"><i class="fa-solid fa-spinner fa-spin fa-2x text-muted"></i></td></tr>';
    
    try {
        const url = `/products/api?page=${page}&limit=10&search=${encodeURIComponent(currentSearch)}&category=${encodeURIComponent(currentCategory)}&stock_status=${encodeURIComponent(currentStatus)}&sort_by=${encodeURIComponent(currentSort)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch products');
        
        const data = await response.json();
        tbody.innerHTML = '';
        
        if (data.products.length === 0) {
            let emptyMsg = "No products found.";
            let emptyDesc = "Try adjusting your filters or search query.";
            if (!currentSearch && !currentCategory && !currentStatus) {
                emptyMsg = "No products yet";
                emptyDesc = "Add your first product to start managing your inventory and sales.";
            }
            tbody.innerHTML = `
                <tr><td colspan="8" class="text-center" style="padding: 4rem 2rem;">
                    <i class="fa-solid fa-box-open" style="font-size: 3rem; color: var(--border-color); margin-bottom: 1rem;"></i>
                    <h4 style="color: var(--text-primary); margin-bottom: 0.5rem; font-size: 1.125rem;">${emptyMsg}</h4>
                    <p style="color: var(--text-secondary); font-size: 0.875rem;">${emptyDesc}</p>
                </td></tr>`;
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
                
                tr.innerHTML = `
                    <td>
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 36px; height: 36px; border-radius: var(--radius-sm); background: var(--bg-main); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary);">
                                <i class="fa-solid fa-box"></i>
                            </div>
                            <span style="font-weight: 500;">${escapeHtml(p.name)}</span>
                        </div>
                    </td>
                    <td><span class="badge badge-neutral">${escapeHtml(p.category || '-')}</span></td>
                    <td>${formatCurrency(p.buying_price)}</td>
                    <td>${formatCurrency(p.selling_price)}</td>
                    <td style="font-weight: 500;">${p.quantity}</td>
                    <td><span class="badge ${badgeClass}">${statusText}</span></td>
                    <td style="color: var(--text-secondary); font-size: 0.875rem;">${updatedDate}</td>
                    <td style="text-align: right;">
                        <div class="dropdown" style="display: inline-block;">
                            <button class="btn btn-sm btn-secondary" onclick="toggleDropdown(event, ${p.id})">
                                <i class="fa-solid fa-ellipsis-vertical"></i>
                            </button>
                            <div class="dropdown-menu" id="dropdown-${p.id}" style="display: none; position: absolute; right: 0; background: white; border: 1px solid var(--border-color); border-radius: var(--radius-sm); box-shadow: var(--shadow-dropdown); z-index: 100; min-width: 120px; text-align: left;">
                                <a href="#" onclick="openViewProductModal(${p.id}); return false;" style="display: block; padding: 0.5rem 1rem; color: var(--text-primary); text-decoration: none; border-bottom: 1px solid var(--border-color);"><i class="fa-solid fa-eye fa-fw" style="color: var(--text-secondary); margin-right: 0.5rem;"></i> View</a>
                                <a href="#" onclick="openEditProductModal(${p.id}); return false;" style="display: block; padding: 0.5rem 1rem; color: var(--text-primary); text-decoration: none; border-bottom: 1px solid var(--border-color);"><i class="fa-solid fa-pen fa-fw" style="color: var(--text-secondary); margin-right: 0.5rem;"></i> Edit</a>
                                <a href="#" onclick="confirmDeleteProduct(${p.id}); return false;" style="display: block; padding: 0.5rem 1rem; color: var(--status-danger); text-decoration: none;"><i class="fa-solid fa-trash fa-fw" style="margin-right: 0.5rem;"></i> Delete</a>
                            </div>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            
            // Populate category dropdown dynamically based on loaded products if it's not fully populated.
            // In a real app, this might come from a separate /categories API, but for now we'll do this.
            populateCategories(data.products);
        }
        
        renderPagination(data.page, data.total_pages, data.total);
    } catch (error) {
        console.error('Products error:', error);
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger" style="padding: 2rem;">Unable to load your products. Please try again. <button class="btn btn-sm btn-secondary" style="margin-left: 1rem;" onclick="fetchProducts()">Retry</button></td></tr>`;
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

function debounceFetchProducts() {
    clearTimeout(productDebounceTimeout);
    currentSearch = document.getElementById('productSearch').value;
    productDebounceTimeout = setTimeout(() => fetchProducts(1), 300);
}

document.getElementById('productCategory').addEventListener('change', (e) => {
    currentCategory = e.target.value;
    fetchProducts(1);
});

document.getElementById('productStockStatus').addEventListener('change', (e) => {
    currentStatus = e.target.value;
    fetchProducts(1);
});

document.getElementById('productSort').addEventListener('change', (e) => {
    currentSort = e.target.value;
    fetchProducts(1);
});

function populateCategories(products) {
    const select = document.getElementById('productCategory');
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
    btnsHtml += `<button class="btn btn-sm btn-secondary" ${page === 1 ? 'disabled' : ''} onclick="fetchProducts(${page - 1})">Previous</button>`;
    btnsHtml += `<span style="padding: 0.25rem 0.75rem; background: var(--bg-main); border-radius: var(--radius-sm); font-weight: 500; font-size: 0.875rem;">Page ${page}</span>`;
    btnsHtml += `<button class="btn btn-sm btn-secondary" ${page === totalPages ? 'disabled' : ''} onclick="fetchProducts(${page + 1})">Next</button>`;
    
    buttons.innerHTML = btnsHtml;
}

// Modals
function openProductModal() {
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    document.getElementById('modalTitle').textContent = 'Add New Product';
    document.getElementById('productError').style.display = 'none';
    document.getElementById('productModal').style.display = 'flex';
}

function closeProductModal() {
    document.getElementById('productModal').style.display = 'none';
}

async function openEditProductModal(id) {
    try {
        const response = await fetch(`/products/api/${id}`);
        if (!response.ok) throw new Error('Failed to load product details');
        const p = await response.json();
        
        document.getElementById('productId').value = p.id;
        document.getElementById('productName').value = p.name;
        document.getElementById('productCategoryInput').value = p.category || '';
        document.getElementById('buyingPrice').value = p.buying_price;
        document.getElementById('sellingPrice').value = p.selling_price;
        document.getElementById('quantity').value = p.quantity;
        document.getElementById('lowStockLimit').value = p.low_stock_limit;
        
        document.getElementById('modalTitle').textContent = 'Edit Product';
        document.getElementById('productError').style.display = 'none';
        document.getElementById('productModal').style.display = 'flex';
    } catch (error) {
        alert(error.message);
    }
}

async function saveProduct(event) {
    event.preventDefault();
    const btn = document.getElementById('saveProductBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    
    const id = document.getElementById('productId').value;
    const isEdit = !!id;
    const url = isEdit ? `/products/api/${id}` : '/products/api';
    const method = isEdit ? 'PUT' : 'POST';
    
    const payload = {
        name: document.getElementById('productName').value,
        category: document.getElementById('productCategoryInput').value,
        buying_price: parseFloat(document.getElementById('buyingPrice').value),
        selling_price: parseFloat(document.getElementById('sellingPrice').value),
        quantity: parseInt(document.getElementById('quantity').value, 10),
        low_stock_limit: parseInt(document.getElementById('lowStockLimit').value, 10)
    };
    
    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to save product');
        
        closeProductModal();
        fetchProducts(currentPage);
        fetchProductMetrics();
    } catch (error) {
        const errDiv = document.getElementById('productError');
        errDiv.textContent = error.message;
        errDiv.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = isEdit ? 'Save Changes' : 'Add Product';
    }
}

async function openViewProductModal(id) {
    const content = document.getElementById('viewProductContent');
    content.innerHTML = '<div class="text-center"><i class="fa-solid fa-spinner fa-spin fa-2x text-muted"></i></div>';
    document.getElementById('viewProductModal').style.display = 'flex';
    document.getElementById('viewEditBtn').onclick = () => {
        closeViewProductModal();
        openEditProductModal(id);
    };
    
    try {
        const response = await fetch(`/products/api/${id}`);
        if (!response.ok) throw new Error('Failed to load product details');
        const p = await response.json();
        
        let stockStatusHtml = '<span class="badge badge-success">Healthy</span>';
        if (p.quantity === 0) stockStatusHtml = '<span class="badge badge-danger">Out of Stock</span>';
        else if (p.quantity <= p.low_stock_limit) stockStatusHtml = '<span class="badge badge-warning">Low Stock</span>';
        
        const invValue = formatCurrency(p.quantity * p.buying_price);
        
        content.innerHTML = `
            <div style="display: flex; gap: 1.5rem; margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border-color);">
                <div style="width: 80px; height: 80px; border-radius: var(--radius-md); background: var(--bg-main); display: flex; align-items: center; justify-content: center; color: var(--brand-blue); font-size: 2.5rem;">
                    <i class="fa-solid fa-box"></i>
                </div>
                <div>
                    <h3 style="font-size: 1.25rem; margin-bottom: 0.25rem;">${escapeHtml(p.name)}</h3>
                    <div style="color: var(--text-secondary); margin-bottom: 0.5rem;">${escapeHtml(p.category || '-')}</div>
                    ${stockStatusHtml}
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
                <div>
                    <div style="color: var(--text-secondary); font-size: 0.75rem; text-transform: uppercase; font-weight: 600; margin-bottom: 0.25rem;">Pricing</div>
                    <div style="font-weight: 500; font-size: 1.125rem;">Buy: ${formatCurrency(p.buying_price)}</div>
                    <div style="font-weight: 500; font-size: 1.125rem; color: var(--status-success);">Sell: ${formatCurrency(p.selling_price)}</div>
                </div>
                <div>
                    <div style="color: var(--text-secondary); font-size: 0.75rem; text-transform: uppercase; font-weight: 600; margin-bottom: 0.25rem;">Stock</div>
                    <div style="font-weight: 500; font-size: 1.125rem;">${p.quantity} units</div>
                    <div style="color: var(--text-secondary); font-size: 0.875rem;">Limit: ${p.low_stock_limit} units</div>
                </div>
            </div>
            
            <div style="background: var(--bg-main); padding: 1rem; border-radius: var(--radius-sm); display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; text-align: center;">
                <div>
                    <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 0.25rem;">Inventory Value</div>
                    <div style="font-weight: 600; color: var(--text-primary);">${invValue}</div>
                </div>
                <div>
                    <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 0.25rem;">Total Sold</div>
                    <div style="font-weight: 600; color: var(--brand-blue);">${p.total_units_sold}</div>
                </div>
                <div>
                    <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 0.25rem;">Total Revenue</div>
                    <div style="font-weight: 600; color: var(--status-success);">${formatCurrency(p.total_revenue)}</div>
                </div>
            </div>
        `;
    } catch (error) {
        content.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
    }
}

function closeViewProductModal() {
    document.getElementById('viewProductModal').style.display = 'none';
}

let productToDelete = null;

function confirmDeleteProduct(id) {
    productToDelete = id;
    document.getElementById('deleteConfirmModal').style.display = 'flex';
}

function closeDeleteModal() {
    productToDelete = null;
    document.getElementById('deleteConfirmModal').style.display = 'none';
}

document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    if (!productToDelete) return;
    
    const btn = document.getElementById('confirmDeleteBtn');
    btn.disabled = true;
    btn.textContent = 'Deleting...';
    
    try {
        const response = await fetch(`/products/api/${productToDelete}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete product');
        
        closeDeleteModal();
        fetchProducts(currentPage);
        fetchProductMetrics();
    } catch (error) {
        alert(error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Delete Product';
    }
});

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

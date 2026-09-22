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
    
    const payload = {
        payment_method: document.getElementById('paymentMethod').value,
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

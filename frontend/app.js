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

// Customers logic for BizInsight

let currentPage = 1;
let currentSearch = '';
let currentType = '';
let currentActivity = '';
let currentDate = '';
let customerDebounceTimeout;
let dupDebounceTimeout;

let activeCustomerId = null;
let activeCustomerData = null;
let histCurrentPage = 1;

document.addEventListener('DOMContentLoaded', () => {
    fetchMetrics();
    fetchCustomers(1);
});

// Utilities
function formatCurrency(amount) {
    return '₦' + parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ----------------------------------------------------
// DASHBOARD VIEW
// ----------------------------------------------------

async function fetchMetrics() {
    try {
        const res = await fetch('/customers/api/metrics');
        if (!res.ok) throw new Error('Failed to fetch metrics');
        const data = await res.json();
        
        document.getElementById('kpiTotalCustomers').textContent = data.total_customers;
        document.getElementById('kpiNewCustomers').textContent = data.new_customers;
        document.getElementById('kpiReturningCustomers').textContent = data.returning_customers;
        document.getElementById('kpiTotalRevenue').textContent = formatCurrency(data.total_revenue);
    } catch (e) {
        console.error('Metrics error:', e);
    }
}

async function fetchCustomers(page = currentPage) {
    currentPage = page;
    const tbody = document.getElementById('customersTableBody');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 3rem;"><i class="fa-solid fa-spinner fa-spin fa-2x text-muted"></i></td></tr>';
    
    try {
        const url = `/customers/api?page=${page}&limit=10&search=${encodeURIComponent(currentSearch)}&type=${encodeURIComponent(currentType)}&activity=${encodeURIComponent(currentActivity)}&date=${encodeURIComponent(currentDate)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch customers');
        
        const data = await res.json();
        tbody.innerHTML = '';
        
        if (data.customers.length === 0) {
            let emptyMsg = "No customers found.";
            let emptyDesc = "Try adjusting your search or filters.";
            if (!currentSearch && !currentType && !currentActivity && !currentDate) {
                emptyMsg = "No customers yet";
                emptyDesc = "Add your first customer to start building your customer list.";
                tbody.innerHTML = `
                    <tr><td colspan="8" class="text-center" style="padding: 4rem 2rem;">
                        <i class="fa-solid fa-users" style="font-size: 3rem; color: var(--border-color); margin-bottom: 1rem;"></i>
                        <h4 style="color: var(--text-primary); margin-bottom: 0.5rem; font-size: 1.125rem;">${emptyMsg}</h4>
                        <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1.5rem;">${emptyDesc}</p>
                        <button class="btn btn-primary" onclick="openAddCustomerModal()"><i class="fa-solid fa-plus"></i> Add Customer</button>
                    </td></tr>`;
            } else {
                tbody.innerHTML = `
                    <tr><td colspan="8" class="text-center" style="padding: 4rem 2rem;">
                        <i class="fa-solid fa-search" style="font-size: 3rem; color: var(--border-color); margin-bottom: 1rem;"></i>
                        <h4 style="color: var(--text-primary); margin-bottom: 0.5rem; font-size: 1.125rem;">${emptyMsg}</h4>
                        <p style="color: var(--text-secondary); font-size: 0.875rem;">${emptyDesc}</p>
                    </td></tr>`;
            }
        } else {
            data.customers.forEach(c => {
                const tr = document.createElement('tr');
                
                // Determine Badge
                let badgeHtml = '';
                if (c.total_purchases === 0) {
                    badgeHtml = '<span class="badge badge-neutral">No Purchases</span>';
                } else if (c.total_purchases === 1) {
                    badgeHtml = '<span class="badge badge-success">New</span>';
                } else {
                    badgeHtml = '<span class="badge badge-primary">Returning</span>';
                }
                
                tr.innerHTML = `
                    <td style="font-weight: 500;">${escapeHtml(c.name)}</td>
                    <td>${escapeHtml(c.phone || '-')}</td>
                    <td>${escapeHtml(c.email || '-')}</td>
                    <td style="text-align: center;">${c.total_purchases}</td>
                    <td style="font-weight: 600;">${formatCurrency(c.total_spent)}</td>
                    <td style="color: var(--text-secondary); font-size: 0.875rem;">${formatDate(c.last_purchase)}</td>
                    <td>${badgeHtml}</td>
                    <td style="text-align: right;">
                        <button class="btn btn-sm btn-secondary" onclick='openCustomerDetails(${JSON.stringify(c).replace(/'/g, "&#39;")})'>View Details</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
        
        renderPagination(data.page, data.total_pages, data.total);
    } catch (e) {
        console.error('Fetch error:', e);
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger" style="padding: 2rem;">Unable to load customers. Please try again. <button class="btn btn-sm btn-secondary" style="margin-left: 1rem;" onclick="fetchCustomers()">Retry</button></td></tr>`;
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
    btnsHtml += `<button class="btn btn-sm btn-secondary" ${page === 1 ? 'disabled' : ''} onclick="fetchCustomers(${page - 1})">Previous</button>`;
    btnsHtml += `<span style="padding: 0.25rem 0.75rem; background: var(--bg-main); border-radius: var(--radius-sm); font-weight: 500; font-size: 0.875rem;">Page ${page}</span>`;
    btnsHtml += `<button class="btn btn-sm btn-secondary" ${page === totalPages ? 'disabled' : ''} onclick="fetchCustomers(${page + 1})">Next</button>`;
    
    buttons.innerHTML = btnsHtml;
}

// Filters
function debounceFetchCustomers() {
    clearTimeout(customerDebounceTimeout);
    currentSearch = document.getElementById('customerSearch').value;
    customerDebounceTimeout = setTimeout(() => fetchCustomers(1), 300);
}

function filterCustomers() {
    currentType = document.getElementById('customerTypeFilter').value;
    currentActivity = document.getElementById('customerActivityFilter').value;
    currentDate = document.getElementById('customerDateFilter').value;
    fetchCustomers(1);
}

// ----------------------------------------------------
// ADD / EDIT CUSTOMER
// ----------------------------------------------------

function openAddCustomerModal() {
    document.getElementById('customerForm').reset();
    document.getElementById('customerId').value = '';
    document.getElementById('customerModalTitle').textContent = 'Add Customer';
    document.getElementById('customerFormError').style.display = 'none';
    document.getElementById('duplicateWarning').style.display = 'none';
    document.getElementById('customerModal').style.display = 'flex';
}

function openEditFromDetails() {
    if (!activeCustomerData) return;
    
    document.getElementById('customerId').value = activeCustomerData.id;
    document.getElementById('customerName').value = activeCustomerData.name;
    document.getElementById('customerPhone').value = activeCustomerData.phone || '';
    document.getElementById('customerEmail').value = activeCustomerData.email || '';
    document.getElementById('customerAddress').value = activeCustomerData.address || '';
    
    document.getElementById('customerModalTitle').textContent = 'Edit Customer';
    document.getElementById('customerFormError').style.display = 'none';
    document.getElementById('duplicateWarning').style.display = 'none';
    
    document.getElementById('customerDetailsModal').style.display = 'none';
    document.getElementById('customerModal').style.display = 'flex';
}

function closeCustomerModal() {
    document.getElementById('customerModal').style.display = 'none';
    // If we were editing from details, reopen details
    if (document.getElementById('customerId').value && activeCustomerData) {
        document.getElementById('customerDetailsModal').style.display = 'flex';
    }
}

// Duplicate Detection
function debounceDuplicateCheck() {
    clearTimeout(dupDebounceTimeout);
    dupDebounceTimeout = setTimeout(checkDuplicate, 500);
}

async function checkDuplicate() {
    const isEdit = document.getElementById('customerId').value !== '';
    if (isEdit) return; // Don't check on edit to avoid matching self
    
    const email = document.getElementById('customerEmail').value.trim();
    const phone = document.getElementById('customerPhone').value.trim();
    const warnDiv = document.getElementById('duplicateWarning');
    
    if (!email && !phone) {
        warnDiv.style.display = 'none';
        return;
    }
    
    try {
        const res = await fetch('/customers/api/validate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, phone })
        });
        const data = await res.json();
        
        warnDiv.style.display = data.duplicate ? 'block' : 'none';
    } catch (e) {
        console.error('Validation error:', e);
    }
}

async function saveCustomer(e) {
    e.preventDefault();
    
    const id = document.getElementById('customerId').value;
    const btn = document.getElementById('btnSaveCustomer');
    const errDiv = document.getElementById('customerFormError');
    
    btn.disabled = true;
    btn.textContent = 'Saving...';
    errDiv.style.display = 'none';
    
    const payload = {
        name: document.getElementById('customerName').value,
        phone: document.getElementById('customerPhone').value,
        email: document.getElementById('customerEmail').value,
        address: document.getElementById('customerAddress').value
    };
    
    try {
        const url = id ? `/customers/api/${id}` : '/customers/api';
        const method = id ? 'PUT' : 'POST';
        
        const res = await fetch(url, {
            method: method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save customer');
        
        // Success
        document.getElementById('customerModal').style.display = 'none';
        
        if (id && activeCustomerData) {
            // Update local object and reopen details
            activeCustomerData = {...activeCustomerData, ...payload};
            populateCustomerDetailsUI(activeCustomerData);
            document.getElementById('customerDetailsModal').style.display = 'flex';
        }
        
        fetchMetrics();
        fetchCustomers(currentPage);
        
    } catch (error) {
        errDiv.textContent = error.message;
        errDiv.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Customer';
    }
}


// ----------------------------------------------------
// DETAILS & INSIGHTS
// ----------------------------------------------------

async function openCustomerDetails(customer) {
    activeCustomerId = customer.id;
    activeCustomerData = customer;
    histCurrentPage = 1;
    
    populateCustomerDetailsUI(customer);
    document.getElementById('customerDetailsModal').style.display = 'flex';
    
    // Fetch Insights
    fetchInsights(customer.id);
    // Fetch History
    fetchHistory(customer.id, 1);
}

function populateCustomerDetailsUI(c) {
    document.getElementById('detailsName').textContent = escapeHtml(c.name);
    document.getElementById('detailsJoined').textContent = `Joined: ${formatDate(c.created_at)}`;
    
    document.getElementById('detailsPhone').textContent = escapeHtml(c.phone || 'No phone provided');
    document.getElementById('detailsEmail').textContent = escapeHtml(c.email || 'No email provided');
    document.getElementById('detailsAddress').textContent = escapeHtml(c.address || 'No address provided');
}

async function fetchInsights(id) {
    const statSpent = document.getElementById('insightTotalSpent');
    const statCount = document.getElementById('insightPurchaseCount');
    const statAvg = document.getElementById('insightAvgOrder');
    const statLast = document.getElementById('insightLastPurchase');
    const statFav = document.getElementById('insightFavorite');
    
    [statSpent, statCount, statAvg, statLast, statFav].forEach(el => el.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>');
    
    try {
        const res = await fetch(`/customers/api/${id}/insights`);
        if (!res.ok) throw new Error('Insights failed');
        const data = await res.json();
        
        statSpent.textContent = formatCurrency(data.total_spent);
        statCount.textContent = data.purchase_count;
        statAvg.textContent = formatCurrency(data.avg_order);
        statLast.textContent = formatDate(data.last_purchase);
        statFav.textContent = escapeHtml(data.favorite_product || 'N/A');
    } catch (e) {
        [statSpent, statCount, statAvg, statLast, statFav].forEach(el => el.textContent = 'Error');
    }
}

async function fetchHistory(id, page) {
    histCurrentPage = page;
    const tbody = document.getElementById('customerHistoryBody');
    const pag = document.getElementById('historyPagination');
    
    tbody.innerHTML = '<tr><td colspan="5" class="text-center"><i class="fa-solid fa-spinner fa-spin text-muted"></i></td></tr>';
    pag.style.display = 'none';
    
    try {
        const res = await fetch(`/customers/api/${id}/sales?page=${page}&limit=5`);
        if (!res.ok) throw new Error('History failed');
        const data = await res.json();
        
        tbody.innerHTML = '';
        if (data.sales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 2rem; color: var(--text-secondary);">No purchases yet.</td></tr>';
        } else {
            data.sales.forEach(s => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="font-weight: 500;">#${s.id}</td>
                    <td>${formatDate(s.created_at)}</td>
                    <td style="text-align: center;">${s.total_items || 0}</td>
                    <td style="font-weight: 600;">${formatCurrency(s.total_amount)}</td>
                    <td><span class="badge ${s.status === 'Completed' ? 'badge-success' : 'badge-danger'}">${s.status}</span></td>
                `;
                tbody.appendChild(tr);
            });
            
            // Setup Pagination
            if (data.total_pages > 1) {
                pag.style.display = 'flex';
                document.getElementById('histPageInfo').textContent = `Page ${page} of ${data.total_pages}`;
                
                const btnPrev = document.getElementById('btnHistPrev');
                const btnNext = document.getElementById('btnHistNext');
                
                btnPrev.disabled = page === 1;
                btnNext.disabled = page === data.total_pages;
                
                btnPrev.onclick = () => fetchHistory(id, page - 1);
                btnNext.onclick = () => fetchHistory(id, page + 1);
            }
        }
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Failed to load history</td></tr>';
    }
}

function closeCustomerDetailsModal() {
    document.getElementById('customerDetailsModal').style.display = 'none';
    activeCustomerId = null;
    activeCustomerData = null;
}

function recordSaleForCustomer() {
    // Navigate to sales page
    window.location.href = '/sales';
    // Optionally we could pass a query param ?customer_id=X to auto-select them,
    // but navigating to sales is the main requirement.
}

async function archiveCustomer() {
    if (!activeCustomerId) return;
    
    if (!confirm("Are you sure you want to archive/delete this customer? This will remove them from the active list. Historical sales will be preserved.")) {
        return;
    }
    
    try {
        const res = await fetch(`/customers/api/${activeCustomerId}`, { method: 'DELETE' });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || 'Failed to archive customer');
        
        alert(data.message);
        closeCustomerDetailsModal();
        fetchMetrics();
        fetchCustomers(currentPage);
        
    } catch (e) {
        alert(e.message);
    }
}

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

// Legacy INVENTORY FUNCTIONS removed, now handled by inventory.js

// Legacy SALES AND POS FUNCTIONS removed, now handled by sales.js
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

// EXPENSES FUNCTIONS REMOVED. Now in expenses.js.

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

// Global Search
function handleGlobalSearch(event) {
    if (event.key === 'Enter') {
        const query = event.target.value.trim();
        if (query) {
            window.location.href = `/products?search=${encodeURIComponent(query)}`;
        }
    }
}

// Notifications
let notificationsLoaded = false;
async function fetchNotifications() {
    try {
        const res = await fetch('/notifications/api');
        if (!res.ok) return;
        const notifications = await res.json();
        
        const badge = document.getElementById('notificationBadge');
        const body = document.getElementById('notificationsBody');
        
        if (notifications.length > 0) {
            if (badge) badge.style.display = 'block';
            if (body) {
                body.innerHTML = notifications.map(n => `
                    <div class="nd-item">
                        <div class="nd-title ${n.type}">${escapeHtml(n.title)}</div>
                        <div class="nd-desc">${escapeHtml(n.message)}</div>
                    </div>
                `).join('');
            }
        } else {
            if (badge) badge.style.display = 'none';
            if (body) {
                body.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--text-secondary); font-size:0.875rem;">No new notifications</div>';
            }
        }
    } catch (e) {
        console.error('Failed to load notifications', e);
    }
}

function toggleNotifications() {
    const dropdown = document.getElementById('notificationsDropdown');
    if (!dropdown) return;
    
    dropdown.classList.toggle('show');
    
    if (dropdown.classList.contains('show') && !notificationsLoaded) {
        fetchNotifications();
        notificationsLoaded = true;
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', (event) => {
    const bell = document.getElementById('topbarBell');
    if (bell && !bell.contains(event.target)) {
        document.getElementById('notificationsDropdown')?.classList.remove('show');
    }
});

// Initial notification check on load
document.addEventListener('DOMContentLoaded', () => {
    fetchNotifications();
});

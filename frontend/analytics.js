let trendsChartInstance = null;
let profitChartInstance = null;
let expensesChartInstance = null;
let currentTrendsData = [];

document.addEventListener('DOMContentLoaded', () => {
    // Only fetch if on analytics page
    if (document.getElementById('analyticsDateFilter')) {
        fetchAnalytics();
    }
});

// Utility formatters
function formatCurrency(amount) {
    if (amount == null) return '₦0.00';
    return '₦' + parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(num) {
    if (num == null) return '0';
    return parseInt(num).toLocaleString('en-US');
}

function formatChange(change) {
    if (change === null) return `<span class="text-muted" style="font-size: 0.8rem;">Not enough historical data</span>`;
    const val = parseFloat(change);
    if (val > 0) {
        return `<span style="color: var(--status-success); font-size: 0.875rem; font-weight: 500;"><i class="fa-solid fa-arrow-trend-up"></i> +${val.toFixed(1)}%</span> <span class="text-muted" style="font-size: 0.8rem;">vs previous</span>`;
    } else if (val < 0) {
        return `<span style="color: var(--status-danger); font-size: 0.875rem; font-weight: 500;"><i class="fa-solid fa-arrow-trend-down"></i> ${val.toFixed(1)}%</span> <span class="text-muted" style="font-size: 0.8rem;">vs previous</span>`;
    } else {
        return `<span class="text-muted" style="font-size: 0.875rem; font-weight: 500;">0.0%</span> <span class="text-muted" style="font-size: 0.8rem;">vs previous</span>`;
    }
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString().replace(/[&<"'>]/g, (m) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'})[m]);
}

// Main fetch coordinator
async function fetchAnalytics() {
    const dateFilter = document.getElementById('analyticsDateFilter').value;
    const query = `?date=${dateFilter}`;
    
    try {
        await Promise.all([
            fetchOverview(query),
            fetchTrends(query),
            fetchExpenses(query),
            fetchProducts(query),
            fetchCustomers(query),
            fetchInventory(query),
            fetchPayments(query),
            fetchInsights(query)
        ]);
    } catch (e) {
        console.error("Failed to load analytics:", e);
    }
}

// 1. Overview KPIs
async function fetchOverview(query) {
    try {
        const res = await fetch(`/analytics/api/overview${query}`);
        const data = await res.json();
        
        document.getElementById('kpiRevenue').textContent = formatCurrency(data.revenue);
        document.getElementById('trendRevenue').innerHTML = formatChange(data.revenue_change);
        
        document.getElementById('kpiGrossProfit').textContent = formatCurrency(data.gross_profit);
        document.getElementById('trendGrossProfit').innerHTML = formatChange(data.gross_profit_change);
        
        document.getElementById('kpiNetProfit').textContent = formatCurrency(data.net_profit);
        document.getElementById('trendNetProfit').innerHTML = formatChange(data.net_profit_change);
        
        document.getElementById('kpiExpenses').textContent = formatCurrency(data.expenses);
        document.getElementById('trendExpenses').innerHTML = formatChange(data.expenses_change);
        
        document.getElementById('kpiSalesCount').textContent = formatNumber(data.sales_count);
        document.getElementById('trendSalesCount').innerHTML = formatChange(data.sales_count_change);
        
        document.getElementById('kpiAvgOrder').textContent = formatCurrency(data.avg_order);
        document.getElementById('trendAvgOrder').innerHTML = formatChange(data.avg_order_change);
        
    } catch (e) {
        console.error("Overview error:", e);
    }
}

// 2. Trends (Revenue, Sales, Profit)
async function fetchTrends(query) {
    try {
        const res = await fetch(`/analytics/api/trends${query}`);
        currentTrendsData = await res.json();
        renderTrendsChart();
        renderProfitChart();
    } catch (e) {
        console.error("Trends error:", e);
    }
}

function renderTrendsChart() {
    const ctx = document.getElementById('trendsChart').getContext('2d');
    const type = document.getElementById('trendChartType').value; // 'revenue' or 'sales'
    
    const labels = currentTrendsData.map(d => d.label);
    const dataValues = currentTrendsData.map(d => type === 'revenue' ? d.revenue : d.sales);
    
    const labelName = type === 'revenue' ? 'Revenue (₦)' : 'Number of Sales';
    
    if (trendsChartInstance) trendsChartInstance.destroy();
    
    trendsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: labelName,
                data: dataValues,
                borderColor: '#2563EB',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointBackgroundColor: '#2563EB'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#F3F4F6' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderProfitChart() {
    const ctx = document.getElementById('profitChart').getContext('2d');
    
    const labels = currentTrendsData.map(d => d.label);
    const gpData = currentTrendsData.map(d => d.gross_profit);
    const npData = currentTrendsData.map(d => d.net_profit);
    
    if (profitChartInstance) profitChartInstance.destroy();
    
    profitChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Gross Profit',
                    data: gpData,
                    backgroundColor: '#10B981',
                    borderRadius: 4
                },
                {
                    label: 'Net Profit',
                    data: npData,
                    backgroundColor: '#14B8A6',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: '#F3F4F6' } },
                x: { grid: { display: false } }
            }
        }
    });
}

// 3. Expenses
async function fetchExpenses(query) {
    try {
        const res = await fetch(`/analytics/api/expenses${query}`);
        const data = await res.json();
        renderExpensesChart(data);
        renderExpensesList(data);
    } catch (e) {
        console.error("Expenses error:", e);
    }
}

function renderExpensesChart(data) {
    const ctx = document.getElementById('expensesChart').getContext('2d');
    
    if (expensesChartInstance) expensesChartInstance.destroy();
    
    if (data.length === 0) {
        // Handle empty state gracefully
        expensesChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['No Expenses'], datasets: [{ data: [1], backgroundColor: ['#E5E7EB'] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
        });
        return;
    }
    
    const labels = data.map(d => d.category);
    const values = data.map(d => d.total);
    
    const colors = [
        '#2563EB', '#10B981', '#F59E0B', '#EF4444', 
        '#8B5CF6', '#14B8A6', '#F43F5E', '#06B6D4', '#84CC16'
    ];
    
    expensesChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors.slice(0, data.length),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderExpensesList(data) {
    const listEl = document.getElementById('expensesList');
    listEl.innerHTML = '';
    
    if (data.length === 0) {
        listEl.innerHTML = '<div class="text-center text-muted" style="padding: 1rem;">No expense data available for this period.</div>';
        return;
    }
    
    const total = data.reduce((sum, item) => sum + item.total, 0);
    
    const colors = [
        '#2563EB', '#10B981', '#F59E0B', '#EF4444', 
        '#8B5CF6', '#14B8A6', '#F43F5E', '#06B6D4', '#84CC16'
    ];
    
    data.forEach((item, idx) => {
        const pct = total > 0 ? ((item.total / total) * 100).toFixed(1) : 0;
        const color = colors[idx % colors.length];
        
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '0.5rem 0';
        row.style.borderBottom = '1px solid var(--border-color)';
        
        row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${color};"></div>
                <span style="font-size: 0.875rem; font-weight: 500;">${escapeHtml(item.category)}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 1rem;">
                <span style="font-size: 0.875rem; font-weight: 600;">${formatCurrency(item.total)}</span>
                <span style="font-size: 0.75rem; color: var(--text-secondary); width: 40px; text-align: right;">${pct}%</span>
            </div>
        `;
        listEl.appendChild(row);
    });
}

// 4. Top Products
async function fetchProducts(query) {
    const tbody = document.getElementById('topProductsBody');
    try {
        const res = await fetch(`/analytics/api/products${query}`);
        const data = await res.json();
        
        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted" style="padding: 2rem;">No product performance data available.</td></tr>';
            return;
        }
        
        data.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 500;">${escapeHtml(p.name)}</td>
                <td style="text-align: right;">${formatNumber(p.units_sold)}</td>
                <td style="text-align: right; font-weight: 600;">${formatCurrency(p.revenue)}</td>
                <td style="text-align: right; color: var(--status-success);">${formatCurrency(p.profit)}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Failed to load</td></tr>';
    }
}

// 5. Customers
async function fetchCustomers(query) {
    const tbody = document.getElementById('topCustomersBody');
    try {
        const res = await fetch(`/analytics/api/customers${query}`);
        const data = await res.json();
        
        document.getElementById('custActive').textContent = formatNumber(data.active_customers);
        document.getElementById('custReturning').textContent = formatNumber(data.returning_customers);
        document.getElementById('custNew').textContent = formatNumber(data.new_customers);
        
        tbody.innerHTML = '';
        if (data.top_customers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted" style="padding: 2rem;">No customer data available yet.</td></tr>';
            return;
        }
        
        data.top_customers.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 500;">${escapeHtml(c.name)}</td>
                <td style="text-align: center;"><span class="badge badge-neutral">${formatNumber(c.purchases)}</span></td>
                <td style="text-align: right; font-weight: 600;">${formatCurrency(c.total_spent)}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Failed to load</td></tr>';
    }
}

// 6. Inventory Alerts
async function fetchInventory(query) {
    const tbody = document.getElementById('inventoryAlertsBody');
    try {
        const res = await fetch(`/analytics/api/inventory`); // inventory is current state, ignoring date filter
        const data = await res.json();
        
        document.getElementById('invValue').textContent = formatCurrency(data.inventory_value);
        document.getElementById('invProducts').textContent = formatNumber(data.total_products);
        
        tbody.innerHTML = '';
        if (data.alerts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted" style="padding: 2rem;">All inventory levels are healthy.</td></tr>';
            return;
        }
        
        data.alerts.forEach(a => {
            let statusBadge = '';
            if (a.quantity === 0) {
                statusBadge = '<span class="badge badge-error">Out of Stock</span>';
            } else {
                statusBadge = '<span class="badge badge-warning">Low Stock</span>';
            }
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 500;">${escapeHtml(a.name)}</td>
                <td style="text-align: right;">${formatNumber(a.quantity)}</td>
                <td style="text-align: center;">${statusBadge}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Failed to load</td></tr>';
    }
}

// 7. Payment Methods
async function fetchPayments(query) {
    const tbody = document.getElementById('paymentsBody');
    try {
        const res = await fetch(`/analytics/api/payments${query}`);
        const data = await res.json();
        
        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted" style="padding: 2rem;">No transaction data available.</td></tr>';
            return;
        }
        
        data.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 500;">${escapeHtml(p.payment_method)}</td>
                <td style="text-align: center;">${formatNumber(p.count)}</td>
                <td style="text-align: right; font-weight: 600;">${formatCurrency(p.total)}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Failed to load</td></tr>';
    }
}

// 8. Business Insights
async function fetchInsights(query) {
    const container = document.getElementById('insightsContainer');
    try {
        const res = await fetch(`/analytics/api/insights${query}`);
        const data = await res.json();
        
        container.innerHTML = '';
        
        if (data.length === 0) {
            // Handled by backend, but just in case
            container.innerHTML = '<div class="text-center text-muted" style="padding: 2rem;">No insights available.</div>';
            return;
        }
        
        data.forEach(insight => {
            const div = document.createElement('div');
            
            // Map types to styles and icons
            let iconClass = 'fa-info-circle';
            let iconColor = 'var(--brand-blue)';
            let bgClass = 'bg-blue-50';
            
            if (insight.type === 'danger') {
                iconClass = 'fa-circle-exclamation';
                iconColor = 'var(--status-danger)';
                bgClass = 'bg-red-50';
            } else if (insight.type === 'warning') {
                iconClass = 'fa-triangle-exclamation';
                iconColor = 'var(--status-warning)';
                bgClass = 'bg-amber-50';
            } else if (insight.type === 'success') {
                iconClass = 'fa-circle-check';
                iconColor = 'var(--status-success)';
                bgClass = 'bg-green-50';
            }
            
            div.style.display = 'flex';
            div.style.gap = '1rem';
            div.style.padding = '1rem';
            div.style.borderRadius = 'var(--radius-md)';
            div.style.backgroundColor = 'var(--bg-hover)';
            div.style.border = '1px solid var(--border-color)';
            
            div.innerHTML = `
                <div style="color: ${iconColor}; font-size: 1.25rem; margin-top: 2px;">
                    <i class="fa-solid ${iconClass}"></i>
                </div>
                <div>
                    <h4 style="margin: 0 0 0.25rem 0; font-size: 0.95rem; color: var(--text-primary);">${escapeHtml(insight.title)}</h4>
                    <p style="margin: 0; font-size: 0.875rem; color: var(--text-secondary); line-height: 1.4;">${escapeHtml(insight.message)}</p>
                </div>
            `;
            container.appendChild(div);
        });
        
    } catch (e) {
        container.innerHTML = '<div class="text-center text-danger" style="padding: 2rem;">Failed to load insights.</div>';
    }
}

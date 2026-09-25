let currentReportType = null;

const reportNames = {
    'sales': 'Sales Report',
    'profit_loss': 'Profit & Loss Statement',
    'expenses': 'Expense Report',
    'products': 'Product Performance Report',
    'inventory': 'Inventory Valuation Report',
    'customers': 'Customer Insights Report'
};

function formatCurrency(amount) {
    if (amount == null) return '₦0.00';
    return '₦' + parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(num) {
    if (num == null) return '0';
    return parseInt(num).toLocaleString('en-US');
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString().replace(/[&<"'>]/g, (m) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'})[m]);
}

function selectReport(type) {
    currentReportType = type;
    
    // Update active states
    document.querySelectorAll('.report-card').forEach(card => card.classList.remove('active'));
    event.currentTarget.classList.add('active');
    
    generateReport();
}

function handleDateChange() {
    if (currentReportType) {
        generateReport();
    }
}

async function generateReport() {
    if (!currentReportType) return;
    
    const dateFilter = document.getElementById('globalDateFilter');
    const dateVal = dateFilter.value;
    const dateText = dateFilter.options[dateFilter.selectedIndex].text;
    
    // UI Reset
    document.getElementById('reportSelectionContainer').style.display = 'none';
    document.getElementById('reportPreviewContainer').style.display = 'none';
    document.getElementById('reportActions').style.display = 'none';
    document.getElementById('errorState').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('loadingSpinner').style.display = 'block';
    
    try {
        const res = await fetch(`/reports/api/data/${currentReportType}?date=${dateVal}`);
        if (!res.ok) throw new Error("Server returned " + res.status);
        
        const data = await res.json();
        
        // Render Header
        document.getElementById('previewReportTitle').textContent = reportNames[currentReportType];
        document.getElementById('previewReportPeriod').textContent = `Period: ${dateText}`;
        const now = new Date();
        document.getElementById('previewReportDate').textContent = `Generated: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
        
        // Render Specifics
        const isEmpty = renderPreview(currentReportType, data);
        
        document.getElementById('loadingSpinner').style.display = 'none';
        
        if (isEmpty) {
            document.getElementById('emptyState').style.display = 'block';
            document.getElementById('reportSelectionContainer').style.display = 'grid'; // bring back selection if empty
        } else {
            document.getElementById('reportPreviewContainer').style.display = 'block';
            document.getElementById('reportActions').style.display = 'flex';
        }
        
    } catch (e) {
        console.error("Report generation failed:", e);
        document.getElementById('loadingSpinner').style.display = 'none';
        document.getElementById('errorState').style.display = 'block';
        document.getElementById('reportSelectionContainer').style.display = 'grid'; // bring back selection
    }
}

function downloadCSV() {
    if (!currentReportType) return;
    const dateVal = document.getElementById('globalDateFilter').value;
    window.location.href = `/reports/api/download/${currentReportType}?date=${dateVal}`;
}

// Render specific report bodies
function renderPreview(type, data) {
    const summary = document.getElementById('previewSummary');
    const content = document.getElementById('previewContent');
    summary.innerHTML = '';
    content.innerHTML = '';
    
    if (type === 'sales') {
        if (data.total_sales === 0) return true;
        
        summary.innerHTML = `
            <div class="summary-item"><div class="summary-label">Total Revenue</div><div class="summary-value">${formatCurrency(data.total_revenue)}</div></div>
            <div class="summary-item"><div class="summary-label">Total Sales</div><div class="summary-value">${formatNumber(data.total_sales)}</div></div>
            <div class="summary-item"><div class="summary-label">Avg Order Value</div><div class="summary-value">${formatCurrency(data.avg_order)}</div></div>
        `;
        
        let rows = data.sales.map(s => `
            <tr>
                <td>${escapeHtml(s.created_at)}</td>
                <td>#${s.id}</td>
                <td>${escapeHtml(s.customer_name || 'Guest')}</td>
                <td style="text-align:center">${s.items_count}</td>
                <td style="text-align:right">${formatCurrency(s.total_amount)}</td>
                <td>${escapeHtml(s.payment_method)}</td>
                <td><span class="badge ${s.status === 'Completed' ? 'badge-success' : 'badge-danger'}">${s.status}</span></td>
            </tr>
        `).join('');
        
        content.innerHTML = `
            <table class="data-table">
                <thead><tr><th>Date</th><th>Sale ID</th><th>Customer</th><th style="text-align:center">Items</th><th style="text-align:right">Total</th><th>Method</th><th>Status</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `;
        return false;
    }
    
    if (type === 'profit_loss') {
        if (data.revenue === 0 && data.expenses === 0) return true;
        
        summary.innerHTML = `
            <div class="summary-item"><div class="summary-label">Total Revenue</div><div class="summary-value" style="color: var(--brand-blue)">${formatCurrency(data.revenue)}</div></div>
            <div class="summary-item"><div class="summary-label">Cost of Goods (COGS)</div><div class="summary-value" style="color: var(--status-warning)">${formatCurrency(data.cogs)}</div></div>
            <div class="summary-item"><div class="summary-label">Gross Profit</div><div class="summary-value" style="color: var(--brand-navy)">${formatCurrency(data.gross_profit)}</div></div>
            <div class="summary-item"><div class="summary-label">Operating Expenses</div><div class="summary-value" style="color: var(--status-danger)">${formatCurrency(data.expenses)}</div></div>
            <div class="summary-item" style="background: #ECFDF5; border: 1px solid #A7F3D0;"><div class="summary-label">Net Profit</div><div class="summary-value" style="color: var(--status-success)">${formatCurrency(data.net_profit)}</div></div>
        `;
        
        content.innerHTML = `
            <div style="width: 100%; background: #F8FAFC; padding: 2rem; border-radius: 8px; border: 1px solid var(--border-color);">
                <div style="display:flex; justify-content:space-between; margin-bottom:1rem; font-size:1.1rem;"><span>Revenue</span> <span style="font-weight:600;">${formatCurrency(data.revenue)}</span></div>
                <div style="display:flex; justify-content:space-between; margin-bottom:1rem; font-size:1.1rem; color: var(--status-danger);"><span>Cost of Goods Sold</span> <span style="font-weight:600;">- ${formatCurrency(data.cogs)}</span></div>
                <div style="display:flex; justify-content:space-between; padding:1rem 0; border-top:2px solid var(--border-color); border-bottom:2px solid var(--border-color); margin-bottom:1rem; font-size:1.2rem; font-weight:700;"><span>Gross Profit</span> <span>${formatCurrency(data.gross_profit)}</span></div>
                <div style="display:flex; justify-content:space-between; margin-bottom:1rem; font-size:1.1rem; color: var(--status-danger);"><span>Operating Expenses</span> <span style="font-weight:600;">- ${formatCurrency(data.expenses)}</span></div>
                <div style="display:flex; justify-content:space-between; padding:1rem 0; border-top:3px double var(--border-color); font-size:1.4rem; font-weight:700; color: var(--status-success);"><span>Net Profit</span> <span>${formatCurrency(data.net_profit)}</span></div>
            </div>
        `;
        return false;
    }
    
    if (type === 'expenses') {
        if (data.total === 0) return true;
        
        summary.innerHTML = `
            <div class="summary-item"><div class="summary-label">Total Expenses</div><div class="summary-value">${formatCurrency(data.total)}</div></div>
            <div class="summary-item"><div class="summary-label">Largest Category</div><div class="summary-value">${escapeHtml(data.largest_category)}</div></div>
            <div class="summary-item"><div class="summary-label">Average Expense</div><div class="summary-value">${formatCurrency(data.average)}</div></div>
        `;
        
        let rows = data.expenses.map(e => `
            <tr>
                <td>${escapeHtml(e.expense_date)}</td>
                <td><span class="badge badge-neutral">${escapeHtml(e.category)}</span></td>
                <td>${escapeHtml(e.notes || e.title)}</td>
                <td style="text-align:right; font-weight:600; color:var(--status-danger);">${formatCurrency(e.amount)}</td>
                <td style="text-align:center">${escapeHtml(e.payment_method)}</td>
            </tr>
        `).join('');
        
        content.innerHTML = `
            <table class="data-table">
                <thead><tr><th>Date</th><th>Category</th><th>Description</th><th style="text-align:right">Amount</th><th style="text-align:center">Method</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `;
        return false;
    }
    
    if (type === 'products') {
        if (data.products.length === 0) return true;
        
        const topProduct = data.products[0];
        summary.innerHTML = `
            <div class="summary-item"><div class="summary-label">Top Product (Units)</div><div class="summary-value">${escapeHtml(topProduct.name)}</div></div>
            <div class="summary-item"><div class="summary-label">Top Product Sales</div><div class="summary-value">${formatNumber(topProduct.units_sold)} units</div></div>
            <div class="summary-item"><div class="summary-label">Top Product Revenue</div><div class="summary-value">${formatCurrency(topProduct.revenue)}</div></div>
        `;
        
        let rows = data.products.map(p => `
            <tr>
                <td style="font-weight:500;">${escapeHtml(p.name)}</td>
                <td style="text-align:right">${formatNumber(p.units_sold)}</td>
                <td style="text-align:right">${formatCurrency(p.revenue)}</td>
                <td style="text-align:right; color:var(--text-secondary);">${formatCurrency(p.cogs)}</td>
                <td style="text-align:right; font-weight:600; color:var(--status-success);">${formatCurrency(p.gross_profit)}</td>
                <td style="text-align:center">${formatNumber(p.current_stock)}</td>
            </tr>
        `).join('');
        
        content.innerHTML = `
            <table class="data-table">
                <thead><tr><th>Product Name</th><th style="text-align:right">Units Sold</th><th style="text-align:right">Revenue</th><th style="text-align:right">COGS</th><th style="text-align:right">Gross Profit</th><th style="text-align:center">Current Stock</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `;
        return false;
    }
    
    if (type === 'inventory') {
        if (data.total_products === 0) return true;
        
        summary.innerHTML = `
            <div class="summary-item"><div class="summary-label">Total Valuation</div><div class="summary-value">${formatCurrency(data.inventory_value)}</div></div>
            <div class="summary-item"><div class="summary-label">Total Units</div><div class="summary-value">${formatNumber(data.total_units)}</div></div>
            <div class="summary-item"><div class="summary-label">Unique Products</div><div class="summary-value">${formatNumber(data.total_products)}</div></div>
            <div class="summary-item" style="${data.low_stock > 0 ? 'border:1px solid var(--status-warning);' : ''}"><div class="summary-label">Low Stock Items</div><div class="summary-value" style="color:var(--status-warning);">${formatNumber(data.low_stock)}</div></div>
            <div class="summary-item" style="${data.out_of_stock > 0 ? 'border:1px solid var(--status-danger);' : ''}"><div class="summary-label">Out of Stock</div><div class="summary-value" style="color:var(--status-danger);">${formatNumber(data.out_of_stock)}</div></div>
        `;
        
        let rows = data.products.map(p => {
            let status = '<span class="badge badge-success">In Stock</span>';
            if (p.quantity === 0) status = '<span class="badge badge-danger">Out of Stock</span>';
            else if (p.quantity <= p.low_stock_limit) status = '<span class="badge badge-warning">Low Stock</span>';
            
            return `
            <tr>
                <td style="font-weight:500;">${escapeHtml(p.name)}</td>
                <td>${escapeHtml(p.category || '-')}</td>
                <td style="text-align:center">${formatNumber(p.quantity)}</td>
                <td style="text-align:right">${formatCurrency(p.buying_price)}</td>
                <td style="text-align:right">${formatCurrency(p.selling_price)}</td>
                <td style="text-align:right; font-weight:600;">${formatCurrency(Math.max(0, p.quantity * p.buying_price))}</td>
                <td style="text-align:center">${status}</td>
            </tr>
            `;
        }).join('');
        
        content.innerHTML = `
            <table class="data-table">
                <thead><tr><th>Product Name</th><th>Category</th><th style="text-align:center">Stock</th><th style="text-align:right">Cost</th><th style="text-align:right">Price</th><th style="text-align:right">Valuation</th><th style="text-align:center">Status</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `;
        return false;
    }
    
    if (type === 'customers') {
        if (data.total_customers === 0) return true;
        
        summary.innerHTML = `
            <div class="summary-item"><div class="summary-label">Total Active Customers</div><div class="summary-value">${formatNumber(data.total_customers)}</div></div>
            <div class="summary-item"><div class="summary-label">Returning Customers</div><div class="summary-value">${formatNumber(data.returning_customers)}</div></div>
            <div class="summary-item"><div class="summary-label">Total Customer Revenue</div><div class="summary-value">${formatCurrency(data.total_revenue)}</div></div>
        `;
        
        let rows = data.customers.map(c => `
            <tr>
                <td style="font-weight:500;">${escapeHtml(c.name)}</td>
                <td>${escapeHtml(c.phone || '-')}</td>
                <td>${escapeHtml(c.email || '-')}</td>
                <td style="text-align:center"><span class="badge badge-neutral">${formatNumber(c.purchases)}</span></td>
                <td style="text-align:right; font-weight:600;">${formatCurrency(c.total_spent)}</td>
                <td>${escapeHtml(c.last_purchase)}</td>
            </tr>
        `).join('');
        
        content.innerHTML = `
            <table class="data-table">
                <thead><tr><th>Customer Name</th><th>Phone</th><th>Email</th><th style="text-align:center">Purchases</th><th style="text-align:right">Total Spent</th><th>Last Purchase</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `;
        return false;
    }

    return true;
}

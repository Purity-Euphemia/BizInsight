let currentPage = 1;
let currentSearch = '';
let currentCategory = '';
let currentDateFilter = '';
let currentPaymentMethod = '';
let currentSort = 'date_desc';
let expenseDebounceTimeout;

let activeExpenseId = null;
let activeExpenseData = null;

// Utility functions
function formatCurrency(amount) {
    return '₦' + parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

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

function getEmptyStateHTML(colspan, title, desc) {
    return `
        <tr>
            <td colspan="${colspan}" class="text-center" style="padding: 4rem 2rem;">
                <div class="empty-state">
                    <i class="fa-solid fa-file-invoice-dollar empty-icon" style="font-size: 3rem; color: var(--border-color); margin-bottom: 1rem;"></i>
                    <h3 class="empty-title" style="margin-bottom: 0.5rem; color: var(--text-primary); font-size: 1.125rem;">${title}</h3>
                    <p class="empty-desc" style="color: var(--text-secondary); margin-bottom: 1.5rem;">${desc}</p>
                    <button class="btn btn-primary" onclick="openAddExpenseModal()">
                        <i class="fa-solid fa-plus"></i> Add Expense
                    </button>
                </div>
            </td>
        </tr>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    fetchMetrics();
    fetchExpenses(1);
});

async function fetchMetrics() {
    try {
        const query = new URLSearchParams({
            date: currentDateFilter
        }).toString();
        
        const res = await fetch(`/expenses/api/metrics?${query}`);
        if (!res.ok) throw new Error('Failed to fetch metrics');
        const data = await res.json();
        
        document.getElementById('kpiTotalExpenses').textContent = formatCurrency(data.total_expenses);
        document.getElementById('kpiThisMonth').textContent = formatCurrency(data.this_month);
        document.getElementById('kpiLargestCategory').textContent = data.largest_category;
        document.getElementById('kpiAverageExpense').textContent = formatCurrency(data.average_expense);
    } catch (e) {
        console.error('Metrics error:', e);
    }
}

async function fetchExpenses(page = 1) {
    const tbody = document.getElementById('expensesTableBody');
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 3rem;"><i class="fa-solid fa-spinner fa-spin fa-2x text-muted"></i></td></tr>`;
    
    try {
        currentPage = page;
        const query = new URLSearchParams({
            page: currentPage,
            limit: 10,
            search: currentSearch,
            category: currentCategory,
            date: currentDateFilter,
            payment_method: currentPaymentMethod,
            sort_by: currentSort
        }).toString();
        
        const res = await fetch(`/expenses/api?${query}`);
        if (!res.ok) throw new Error('Failed to fetch expenses');
        
        const data = await res.json();
        renderExpensesTable(data);
        renderPagination(data);
    } catch (e) {
        console.error('Fetch error:', e);
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger" style="padding: 2rem;">Unable to load expenses. Please try again. <button class="btn btn-sm btn-secondary" style="margin-left: 1rem;" onclick="fetchExpenses()">Retry</button></td></tr>`;
    }
}

function renderExpensesTable(data) {
    const tbody = document.getElementById('expensesTableBody');
    tbody.innerHTML = '';
    
    if (!data.expenses || data.expenses.length === 0) {
        tbody.innerHTML = getEmptyStateHTML(7, "No expenses found", "Start tracking your business spending by adding your first expense.");
        return;
    }
    
    data.expenses.forEach(e => {
        const tr = document.createElement('tr');
        
        // Truncate notes
        let notesText = e.notes || '-';
        if (notesText.length > 30) notesText = notesText.substring(0, 30) + '...';
        
        const badgeColorMap = {
            'Rent': '#E0E7FF; color: #4338CA',
            'Utilities': '#FEF3C7; color: #D97706',
            'Salaries / Wages': '#D1FAE5; color: #059669',
            'Marketing': '#FCE7F3; color: #DB2777',
            'Transport': '#E0F2FE; color: #0284C7',
            'Supplies': '#F3F4F6; color: #4B5563',
            'Maintenance': '#FFEDD5; color: #EA580C',
            'Taxes / Fees': '#FEE2E2; color: #DC2626',
            'Other': '#F3F4F6; color: #6B7280'
        };
        const badgeStyle = badgeColorMap[e.category] || badgeColorMap['Other'];
        const badgeHtml = `<span class="badge" style="background: ${badgeStyle.split(';')[0]}; ${badgeStyle.split(';')[1]}; border: 1px solid rgba(0,0,0,0.05);">${escapeHtml(e.category)}</span>`;
        
        tr.innerHTML = `
            <td style="color: var(--text-secondary); font-size: 0.875rem;">${formatDate(e.expense_date)}</td>
            <td>${badgeHtml}</td>
            <td style="font-weight: 500;">${escapeHtml(e.title)}</td>
            <td style="font-weight: 600; color: var(--status-danger);">-${formatCurrency(e.amount)}</td>
            <td><span class="badge badge-neutral" style="font-weight: 500;">${escapeHtml(e.payment_method)}</span></td>
            <td style="color: var(--text-secondary); font-size: 0.875rem;">${escapeHtml(notesText)}</td>
            <td style="text-align: right;">
                <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                    <button class="btn btn-sm btn-secondary" onclick='viewExpenseDetails(${JSON.stringify(e).replace(/'/g, "&#39;")})' title="View"><i class="fa-solid fa-eye"></i></button>
                    <button class="btn btn-sm btn-secondary" onclick='openEditExpenseModal(${JSON.stringify(e).replace(/'/g, "&#39;")})' title="Edit"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-sm btn-danger-outline" style="color: var(--status-danger); border-color: var(--border-color); background: transparent;" onclick="deleteExpense(${e.id})" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderPagination(data) {
    const info = document.getElementById('paginationInfo');
    const btns = document.getElementById('paginationButtons');
    
    if (data.total === 0) {
        info.textContent = 'Showing 0 to 0 of 0 entries';
        btns.innerHTML = '';
        return;
    }
    
    const start = (data.page - 1) * data.limit + 1;
    const end = Math.min(start + data.limit - 1, data.total);
    info.textContent = `Showing ${start} to ${end} of ${data.total} entries`;
    
    let html = '';
    
    if (data.page > 1) {
        html += `<button class="btn btn-sm btn-secondary" onclick="fetchExpenses(${data.page - 1})">Previous</button>`;
    } else {
        html += `<button class="btn btn-sm btn-secondary" disabled style="opacity: 0.5; cursor: not-allowed;">Previous</button>`;
    }
    
    // Page numbers
    const totalPages = data.total_pages;
    const maxButtons = 5;
    
    let startPage = Math.max(1, data.page - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    
    if (endPage - startPage + 1 < maxButtons) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        if (i === data.page) {
            html += `<button class="btn btn-sm btn-primary">${i}</button>`;
        } else {
            html += `<button class="btn btn-sm btn-secondary" onclick="fetchExpenses(${i})">${i}</button>`;
        }
    }
    
    if (data.page < totalPages) {
        html += `<button class="btn btn-sm btn-secondary" onclick="fetchExpenses(${data.page + 1})">Next</button>`;
    } else {
        html += `<button class="btn btn-sm btn-secondary" disabled style="opacity: 0.5; cursor: not-allowed;">Next</button>`;
    }
    
    btns.innerHTML = html;
}

function debounceFetchExpenses() {
    clearTimeout(expenseDebounceTimeout);
    currentSearch = document.getElementById('expenseSearch').value;
    expenseDebounceTimeout = setTimeout(() => {
        fetchExpenses(1);
    }, 300);
}

function filterExpenses() {
    currentDateFilter = document.getElementById('expenseDateFilter').value;
    currentCategory = document.getElementById('expenseCategoryFilter').value;
    currentPaymentMethod = document.getElementById('expensePaymentFilter').value;
    currentSort = document.getElementById('expenseSortFilter').value;
    
    fetchMetrics();
    fetchExpenses(1);
}

// Modal logic
function openAddExpenseModal() {
    document.getElementById('expenseForm').reset();
    document.getElementById('expenseId').value = '';
    
    // Set default date to today
    document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];
    
    document.getElementById('expenseModalTitle').textContent = 'Add Expense';
    document.getElementById('expenseFormError').style.display = 'none';
    document.getElementById('expenseModal').style.display = 'flex';
}

function openEditExpenseModal(e) {
    document.getElementById('expenseForm').reset();
    document.getElementById('expenseId').value = e.id;
    document.getElementById('expenseTitle').value = e.title;
    document.getElementById('expenseAmount').value = e.amount;
    document.getElementById('expenseDate').value = e.expense_date.split(' ')[0]; // ensure just YYYY-MM-DD
    document.getElementById('expenseCategory').value = e.category || 'Other';
    document.getElementById('expensePaymentMethod').value = e.payment_method || 'Cash';
    document.getElementById('expenseNotes').value = e.notes || '';
    
    document.getElementById('expenseModalTitle').textContent = 'Edit Expense';
    document.getElementById('expenseFormError').style.display = 'none';
    document.getElementById('expenseModal').style.display = 'flex';
}

function closeExpenseModal() {
    document.getElementById('expenseModal').style.display = 'none';
}

function viewExpenseDetails(e) {
    activeExpenseId = e.id;
    activeExpenseData = e;
    
    document.getElementById('detailsTitle').textContent = e.title;
    document.getElementById('detailsAmount').textContent = formatCurrency(e.amount);
    document.getElementById('detailsDate').textContent = formatDate(e.expense_date);
    document.getElementById('detailsCategory').textContent = e.category || 'Other';
    document.getElementById('detailsPaymentMethod').textContent = e.payment_method || 'Cash';
    
    const notesEl = document.getElementById('detailsNotes');
    if (e.notes) {
        notesEl.textContent = e.notes;
        notesEl.style.color = 'var(--text-primary)';
        notesEl.style.fontStyle = 'normal';
    } else {
        notesEl.textContent = 'No notes provided.';
        notesEl.style.color = 'var(--text-tertiary)';
        notesEl.style.fontStyle = 'italic';
    }
    
    document.getElementById('expenseDetailsModal').style.display = 'flex';
    
    // Setup buttons in details modal
    document.getElementById('btnEditFromDetails').onclick = () => {
        closeExpenseDetailsModal();
        openEditExpenseModal(e);
    };
    
    document.getElementById('btnDeleteFromDetails').onclick = () => {
        deleteExpense(e.id);
    };
}

function closeExpenseDetailsModal() {
    document.getElementById('expenseDetailsModal').style.display = 'none';
    activeExpenseId = null;
    activeExpenseData = null;
}

// API Calls
async function saveExpense(event) {
    event.preventDefault();
    
    const btn = document.getElementById('btnSaveExpense');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving...';
    
    const errDiv = document.getElementById('expenseFormError');
    errDiv.style.display = 'none';
    
    const id = document.getElementById('expenseId').value;
    const isEdit = !!id;
    
    const payload = {
        title: document.getElementById('expenseTitle').value,
        amount: parseFloat(document.getElementById('expenseAmount').value),
        expense_date: document.getElementById('expenseDate').value,
        category: document.getElementById('expenseCategory').value,
        payment_method: document.getElementById('expensePaymentMethod').value,
        notes: document.getElementById('expenseNotes').value
    };
    
    try {
        const url = isEdit ? `/expenses/api/${id}` : '/expenses/api';
        const method = isEdit ? 'PUT' : 'POST';
        
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.error || 'Failed to save expense');
        }
        
        closeExpenseModal();
        fetchMetrics();
        fetchExpenses(currentPage);
        
    } catch (e) {
        errDiv.textContent = e.message;
        errDiv.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function deleteExpense(id) {
    if (!confirm("Delete this expense?\n\nThis action will remove the record from your financial history and update your totals.")) {
        return;
    }
    
    try {
        const res = await fetch(`/expenses/api/${id}`, { method: 'DELETE' });
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.error || 'Failed to delete expense');
        }
        
        // If details modal was open, close it
        if (activeExpenseId == id) {
            closeExpenseDetailsModal();
        }
        
        fetchMetrics();
        fetchExpenses(currentPage);
        
    } catch (e) {
        alert("Error: " + e.message);
    }
}

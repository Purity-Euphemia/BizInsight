document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
});

function switchTab(tabId) {
    // Update nav
    document.querySelectorAll('.settings-nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`nav-${tabId}`).classList.add('active');
    
    // Update content
    document.querySelectorAll('.settings-section').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toastMessage');
    const icon = document.getElementById('toastIcon');
    
    msg.textContent = message;
    
    if (isError) {
        toast.className = 'toast toast-error show';
        icon.className = 'fa-solid fa-circle-exclamation';
    } else {
        toast.className = 'toast toast-success show';
        icon.className = 'fa-solid fa-circle-check';
    }
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

async function loadSettings() {
    document.getElementById('settingsLoader').style.display = 'block';
    document.getElementById('settingsError').style.display = 'none';
    document.getElementById('settingsForms').style.display = 'none';
    
    try {
        const res = await fetch('/api/settings/');
        if (!res.ok) throw new Error('Failed to load');
        
        const data = await res.json();
        
        // Populate Business Form
        document.getElementById('bName').value = data.business.name || '';
        document.getElementById('bType').value = data.business.type || 'Other';
        document.getElementById('bPhone').value = data.business.phone || '';
        document.getElementById('bAddress').value = data.business.address || '';
        document.getElementById('bCurrency').value = data.business.currency || 'NGN';
        
        // Populate Account Info
        document.getElementById('uUsername').value = data.user.username;
        document.getElementById('uCreated').value = new Date(data.user.created_at).toLocaleDateString();
        
        document.getElementById('settingsLoader').style.display = 'none';
        document.getElementById('settingsForms').style.display = 'block';
        
    } catch (e) {
        console.error(e);
        document.getElementById('settingsLoader').style.display = 'none';
        document.getElementById('settingsError').style.display = 'block';
    }
}

async function saveBusiness(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSaveBusiness');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    
    const payload = {
        name: document.getElementById('bName').value,
        type: document.getElementById('bType').value,
        phone: document.getElementById('bPhone').value,
        address: document.getElementById('bAddress').value,
        currency: document.getElementById('bCurrency').value
    };
    
    try {
        const res = await fetch('/api/settings/business', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (res.ok) {
            showToast('Business information updated successfully');
            // update header name if present
            const headerName = document.getElementById('previewBusinessName');
            if (headerName) headerName.textContent = payload.name;
        } else {
            showToast(data.error || 'Failed to update business', true);
        }
    } catch (err) {
        showToast('Network error occurred', true);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Changes';
    }
}

async function savePreferences(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSavePreferences');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    
    // Preferences currently only include Currency, which is stored on the business object
    const payload = {
        name: document.getElementById('bName').value,
        type: document.getElementById('bType').value,
        phone: document.getElementById('bPhone').value,
        address: document.getElementById('bAddress').value,
        currency: document.getElementById('bCurrency').value
    };
    
    try {
        const res = await fetch('/api/settings/business', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            showToast('Preferences updated successfully');
        } else {
            showToast('Failed to update preferences', true);
        }
    } catch (err) {
        showToast('Network error occurred', true);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Preferences';
    }
}

async function savePassword(e) {
    e.preventDefault();
    
    const pCurrent = document.getElementById('pCurrent').value;
    const pNew = document.getElementById('pNew').value;
    const pConfirm = document.getElementById('pConfirm').value;
    const errorEl = document.getElementById('passwordError');
    const btn = document.getElementById('btnSavePassword');
    
    errorEl.style.display = 'none';
    
    if (pNew !== pConfirm) {
        errorEl.textContent = 'New passwords do not match.';
        errorEl.style.display = 'block';
        return;
    }
    
    if (pNew.length < 6) {
        errorEl.textContent = 'New password must be at least 6 characters.';
        errorEl.style.display = 'block';
        return;
    }
    
    btn.disabled = true;
    btn.textContent = 'Updating...';
    
    try {
        const res = await fetch('/api/settings/password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                current_password: pCurrent,
                new_password: pNew
            })
        });
        
        const data = await res.json();
        if (res.ok) {
            showToast('Password changed successfully');
            document.getElementById('passwordForm').reset();
        } else {
            errorEl.textContent = data.error || 'Failed to change password';
            errorEl.style.display = 'block';
        }
    } catch (err) {
        errorEl.textContent = 'Network error occurred';
        errorEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Update Password';
    }
}

function confirmDelete() {
    // There is no safe-deletion route currently built for BizInsight that handles cascading foreign keys safely.
    // Displaying a professional warning to contact support instead of silently failing or causing orphaned records.
    showToast('Direct account deletion is disabled for data integrity. Please contact support.', true);
}

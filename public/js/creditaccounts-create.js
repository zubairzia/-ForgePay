window.addEventListener('DOMContentLoaded', () => {
  // TEMPORARY: hardcoded tenant header until real login/session exists,
  // same as public/js/customers.js and public/js/creditaccounts.js.
  const tenantHeaders = { 'X-Tenant-Id': '1' };
  const jsonHeaders = { ...tenantHeaders, 'Content-Type': 'application/json' };

  const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Manual string parsing, not `new Date(dateStr).toLocaleDateString()` —
  // that reintroduces the timezone-shift bug fixed in db.js (see
  // public/js/creditaccounts.js for the full explanation).
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}/${year}`;
  };

  const formError = document.getElementById('formError');
  const showError = (message) => {
    formError.innerText = message;
    formError.classList.remove('hidden');
    formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const clearError = () => formError.classList.add('hidden');

  const accountNumberInput = document.getElementById('accountNumber');
  accountNumberInput.value = `CA-${Date.now().toString().slice(-8)}`;

  const startDateInput = document.getElementById('startDate');
  startDateInput.value = new Date().toISOString().slice(0, 10);

  const installmentTypeSelect = document.getElementById('installmentType');
  const recurringFields = document.querySelectorAll('.recurring-field');
  const syncInstallmentFields = () => {
    const isRecurring = installmentTypeSelect.value === 'recurring';
    recurringFields.forEach(el => { el.style.display = isRecurring ? '' : 'none'; });
  };
  installmentTypeSelect.addEventListener('change', syncInstallmentFields);
  syncInstallmentFields();

  // --- Customer search ---
  const customerSearchInput = document.getElementById('customerSearch');
  const customerResults = document.getElementById('customerResults');
  const customerSelected = document.getElementById('customerSelected');
  const customerSelectedName = document.getElementById('customerSelectedName');
  const customerClear = document.getElementById('customerClear');
  const invoiceSelect = document.getElementById('invoiceSelect');

  let selectedCustomer = null;
  let searchDebounce = null;

  const displayCustomerName = (c) =>
    (c.company_name && c.company_name.trim()) || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.customer_code;

  customerSearchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const q = customerSearchInput.value.trim();
    if (!q) {
      customerResults.classList.add('hidden');
      customerResults.innerHTML = '';
      return;
    }
    searchDebounce = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/customers/search?query=${encodeURIComponent(q)}`, { headers: tenantHeaders });
        const customers = await res.json();
        customerResults.innerHTML = '';
        if (!Array.isArray(customers) || customers.length === 0) {
          customerResults.innerHTML = '<div class="px-3 py-2 text-sm text-gray-400">No matches</div>';
        } else {
          customers.forEach(c => {
            const row = document.createElement('div');
            row.className = 'px-3 py-2 text-sm hover:bg-indigo-50 cursor-pointer';
            row.innerText = `${displayCustomerName(c)} (${c.customer_code})`;
            row.addEventListener('click', () => selectCustomer(c));
            customerResults.appendChild(row);
          });
        }
        customerResults.classList.remove('hidden');
      } catch (err) {
        console.error('Error searching customers:', err);
      }
    }, 250);
  });

  const selectCustomer = async (c) => {
    selectedCustomer = c;
    customerSearchInput.value = '';
    customerResults.classList.add('hidden');
    customerResults.innerHTML = '';
    customerSelectedName.innerText = `${displayCustomerName(c)} (${c.customer_code})`;
    customerSelected.classList.remove('hidden');

    invoiceSelect.disabled = false;
    invoiceSelect.innerHTML = '<option value="">— None —</option>';
    try {
      const res = await fetch('/api/v1/invoices', { headers: tenantHeaders });
      const invoices = await res.json();
      (Array.isArray(invoices) ? invoices : [])
        .filter(inv => String(inv.customer_id) === String(c.id))
        .forEach(inv => {
          const opt = document.createElement('option');
          opt.value = inv.id;
          opt.innerText = `${inv.document_number} — ${money(inv.total_amount)}`;
          invoiceSelect.appendChild(opt);
        });
    } catch (err) {
      console.error('Error loading invoices:', err);
    }
  };

  customerClear.addEventListener('click', () => {
    selectedCustomer = null;
    customerSelected.classList.add('hidden');
    invoiceSelect.disabled = true;
    invoiceSelect.innerHTML = '<option value="">— Select a customer first —</option>';
  });

  // --- Preview ---
  let lastPlan = null;

  const buildPayload = (maturityDate) => {
    const installmentType = installmentTypeSelect.value;
    const payload = {
      customerId: selectedCustomer ? selectedCustomer.id : undefined,
      sourceDocumentId: invoiceSelect.value || undefined,
      principalAmount: Number(document.getElementById('principalAmount').value),
      downPaymentAmount: Number(document.getElementById('downPaymentAmount').value || 0),
      markupAmount: Number(document.getElementById('markupAmount').value),
      installmentType,
      startDate: startDateInput.value,
      maturityDate: maturityDate || startDateInput.value,
    };
    if (installmentType === 'recurring') {
      payload.installmentFrequency = document.getElementById('installmentFrequency').value;
      payload.installmentCount = Number(document.getElementById('installmentCount').value);
    }
    return payload;
  };

  const previewPanel = document.getElementById('previewPanel');

  document.getElementById('previewBtn').addEventListener('click', async () => {
    clearError();
    if (!selectedCustomer) {
      showError('Select a customer first.');
      return;
    }
    try {
      const res = await fetch('/api/v1/credit-accounts/preview', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(buildPayload()),
      });
      const plan = await res.json();
      if (!res.ok) {
        showError(plan.message || 'Could not compute preview.');
        return;
      }
      lastPlan = plan;

      document.getElementById('previewFinanced').innerText = money(plan.financedAmount);
      document.getElementById('previewTotalPayable').innerText = money(plan.totalPayableAmount);
      document.getElementById('previewPerInstallment').innerText = money(plan.schedule[0]?.totalDue);
      const maturity = plan.schedule[plan.schedule.length - 1]?.dueDate;
      document.getElementById('previewMaturity').innerText = formatDate(maturity);

      const body = document.getElementById('previewScheduleBody');
      body.innerHTML = '';
      plan.schedule.forEach(line => {
        const row = body.insertRow();
        row.insertCell(0).innerText = line.installmentNumber;
        row.insertCell(1).innerText = formatDate(line.dueDate);
        const p = row.insertCell(2); p.innerText = money(line.principalDue); p.className = 'text-right px-4';
        const m = row.insertCell(3); m.innerText = money(line.markupDue); m.className = 'text-right px-4';
        const t = row.insertCell(4); t.innerText = money(line.totalDue); t.className = 'text-right px-4 font-medium';
        row.querySelectorAll('td').forEach(td => { td.classList.add('px-4', 'py-2'); });
      });

      previewPanel.classList.remove('hidden');
      previewPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error('Error previewing credit account:', err);
      showError('Could not compute preview.');
    }
  });

  // --- Confirm and activate ---
  document.getElementById('confirmBtn').addEventListener('click', async () => {
    clearError();
    if (!lastPlan) return;

    const accountNumber = accountNumberInput.value.trim();
    if (!accountNumber) {
      showError('Account number is required.');
      return;
    }

    // Maturity date is the last installment's due date from the plan we
    // just previewed, so what we submit here is exactly what was shown.
    const maturityDate = lastPlan.schedule[lastPlan.schedule.length - 1].dueDate;
    const payload = { ...buildPayload(maturityDate), accountNumber };

    try {
      const createRes = await fetch('/api/v1/credit-accounts', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      const account = await createRes.json();
      if (!createRes.ok) {
        showError(account.message || 'Could not create credit account.');
        return;
      }

      const activateRes = await fetch(`/api/v1/credit-accounts/${account.id}/status`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ status: 'active' }),
      });
      if (!activateRes.ok) {
        const activateBody = await activateRes.json();
        showError(activateBody.message || 'Account created but could not be activated.');
        return;
      }

      window.location.href = `/credit-accounts/${account.id}/view`;
    } catch (err) {
      console.error('Error creating credit account:', err);
      showError('Could not create credit account.');
    }
  });
});

window.addEventListener('DOMContentLoaded', async () => {
  const tenantHeaders = { 'X-Tenant-Id': '1' };
  const jsonHeaders = { ...tenantHeaders, 'Content-Type': 'application/json' };

  const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Manual string parsing, not `new Date(dateStr).toLocaleDateString()` —
  // see public/js/creditaccounts.js for why that reintroduces the pg
  // DATE-column timezone-shift bug fixed in db.js.
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}/${year}`;
  };

  const statusBadge = (status) => {
    const colors = {
      active: 'bg-blue-100 text-blue-700',
      draft: 'bg-gray-100 text-gray-600',
      closed: 'bg-green-100 text-green-700',
      overdue: 'bg-red-100 text-red-700',
      defaulted: 'bg-red-100 text-red-700',
      cancelled: 'bg-gray-100 text-gray-500',
    };
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}">${status}</span>`;
  };

  const formError = document.getElementById('formError');
  const showError = (message) => {
    formError.innerText = message;
    formError.classList.remove('hidden');
    formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const clearError = () => formError.classList.add('hidden');

  const displayCustomerName = (c) =>
    (c.customer_name && c.customer_name.trim()) || '-';

  const searchSection = document.getElementById('searchSection');
  const repaymentSection = document.getElementById('repaymentSection');
  const accountSearchInput = document.getElementById('accountSearch');
  const accountResults = document.getElementById('accountResults');

  let selectedAccount = null;
  let searchDebounce = null;

  const selectAccount = async (acc) => {
    // Re-fetch the full account (with repaymentSchedule) rather than trust
    // the list-view row, since that's all list rows carry.
    const res = await fetch(`/api/v1/credit-accounts/${acc.id}`, { headers: tenantHeaders });
    if (!res.ok) {
      showError('Could not load that credit account.');
      return;
    }
    selectedAccount = await res.json();

    searchSection.classList.add('hidden');
    repaymentSection.classList.remove('hidden');

    document.getElementById('selAccountNumber').innerText = selectedAccount.account_number;
    document.getElementById('selStatusBadge').innerHTML = statusBadge(selectedAccount.status);
    document.getElementById('selCustomerName').innerText = selectedAccount.customer_name || '-';

    const schedule = selectedAccount.repaymentSchedule || [];
    const openLines = schedule.filter(s => !['paid', 'waived'].includes(s.due_status));
    const nextOpen = openLines[0];
    const currentDue = nextOpen
      ? (Number(nextOpen.principal_due) + Number(nextOpen.markup_due) + Number(nextOpen.penalty_due))
        - (Number(nextOpen.principal_paid) + Number(nextOpen.markup_paid) + Number(nextOpen.penalty_paid))
      : 0;
    const totalOverdue = openLines
      .filter(s => Number(s.days_overdue) > 0)
      .reduce((sum, s) =>
        sum + (Number(s.principal_due) + Number(s.markup_due) + Number(s.penalty_due))
            - (Number(s.principal_paid) + Number(s.markup_paid) + Number(s.penalty_paid)), 0);
    const balance = Number(selectedAccount.outstanding_principal) + Number(selectedAccount.outstanding_markup) + Number(selectedAccount.outstanding_penalty);

    document.getElementById('currentAmountDue').innerText = money(currentDue);
    document.getElementById('totalOverdue').innerText = money(totalOverdue);
    document.getElementById('accountBalance').innerText = money(balance);

    document.getElementById('paymentDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('allocationPanel').classList.add('hidden');
    clearError();
  };

  accountSearchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const q = accountSearchInput.value.trim().toLowerCase();
    if (!q) {
      accountResults.classList.add('hidden');
      accountResults.innerHTML = '';
      return;
    }
    searchDebounce = setTimeout(async () => {
      try {
        const res = await fetch('/api/v1/credit-accounts', { headers: tenantHeaders });
        const accounts = await res.json();
        const matches = (Array.isArray(accounts) ? accounts : []).filter(a =>
          (a.account_number || '').toLowerCase().includes(q) ||
          (a.customer_name || '').toLowerCase().includes(q));

        accountResults.innerHTML = '';
        if (matches.length === 0) {
          accountResults.innerHTML = '<div class="px-3 py-2 text-sm text-gray-400">No matches</div>';
        } else {
          matches.forEach(a => {
            const row = document.createElement('div');
            row.className = 'px-3 py-2 text-sm hover:bg-indigo-50 cursor-pointer flex justify-between';
            row.innerHTML = `<span>${a.account_number} — ${displayCustomerName(a)}</span><span class="text-gray-400">${a.status}</span>`;
            row.addEventListener('click', () => {
              accountResults.classList.add('hidden');
              selectAccount(a);
            });
            accountResults.appendChild(row);
          });
        }
        accountResults.classList.remove('hidden');
      } catch (err) {
        console.error('Error searching credit accounts:', err);
      }
    }, 250);
  });

  document.getElementById('changeAccountBtn').addEventListener('click', () => {
    selectedAccount = null;
    repaymentSection.classList.add('hidden');
    searchSection.classList.remove('hidden');
    accountSearchInput.value = '';
    document.getElementById('confirmationPanel').classList.add('hidden');
  });

  // --- Allocation preview ---
  let lastAllocation = null;

  document.getElementById('previewBtn').addEventListener('click', async () => {
    clearError();
    const amount = Number(document.getElementById('amount').value);
    if (!Number.isFinite(amount) || amount <= 0) {
      showError('Enter a valid amount.');
      return;
    }
    try {
      const res = await fetch(`/api/v1/credit-accounts/${selectedAccount.id}/repayments/preview`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ amount }),
      });
      const preview = await res.json();
      if (!res.ok) {
        showError(preview.message || 'Could not compute allocation preview.');
        return;
      }
      lastAllocation = preview;

      document.getElementById('waterfallOrder').innerText = preview.waterfallOrder;
      const body = document.getElementById('allocationBody');
      body.innerHTML = '';
      preview.installments.forEach(line => {
        const row = body.insertRow();
        const PAD = 'px-4 py-2';
        row.insertCell(0).innerText = line.installmentNumber; row.cells[0].className = PAD;
        row.insertCell(1).innerText = formatDate(line.dueDate); row.cells[1].className = PAD;
        row.insertCell(2).innerText = money(line.appliedPenalty); row.cells[2].className = `${PAD} text-right`;
        row.insertCell(3).innerText = money(line.appliedMarkup); row.cells[3].className = `${PAD} text-right`;
        row.insertCell(4).innerText = money(line.appliedPrincipal); row.cells[4].className = `${PAD} text-right`;
        row.insertCell(5).innerText = money(line.totalApplied); row.cells[5].className = `${PAD} text-right font-medium`;
        row.insertCell(6).innerText = line.dueStatusAfter; row.cells[6].className = PAD;
      });

      const unappliedRow = document.getElementById('unappliedRow');
      if (preview.remainingUnapplied > 0) {
        unappliedRow.innerText = `${money(preview.remainingUnapplied)} could not be applied — it exceeds the open schedule.`;
        unappliedRow.classList.remove('hidden');
      } else {
        unappliedRow.classList.add('hidden');
      }

      document.getElementById('allocationPanel').classList.remove('hidden');
      document.getElementById('allocationPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error('Error previewing allocation:', err);
      showError('Could not compute allocation preview.');
    }
  });

  // --- Post repayment ---
  document.getElementById('postBtn').addEventListener('click', async () => {
    clearError();
    if (!lastAllocation) return;

    const payload = {
      amount: Number(document.getElementById('amount').value),
      paymentDate: document.getElementById('paymentDate').value,
      paymentMethod: document.getElementById('paymentMethod').value,
      referenceNumber: document.getElementById('referenceNumber').value || undefined,
    };

    try {
      const res = await fetch(`/api/v1/credit-accounts/${selectedAccount.id}/repayments`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) {
        showError(result.message || 'Could not post repayment.');
        return;
      }

      const confirmationPanel = document.getElementById('confirmationPanel');
      const lines = result.installments.map(i =>
        `installment #${i.installmentNumber} (${formatDate(i.dueDate)}): ${money(i.totalApplied)} applied — now ${i.dueStatusAfter}`
      ).join('<br>');
      confirmationPanel.innerHTML = `<strong>${result.payment.payment_number}</strong> posted for ${money(result.payment.amount)}.<br>${lines}`;
      confirmationPanel.classList.remove('hidden');
      confirmationPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

      document.getElementById('allocationPanel').classList.add('hidden');
      lastAllocation = null;
    } catch (err) {
      console.error('Error posting repayment:', err);
      showError('Could not post repayment.');
    }
  });

  // --- Optional deep-link pre-fill ---
  if (window.__prefillCreditAccountId) {
    try {
      const res = await fetch(`/api/v1/credit-accounts/${window.__prefillCreditAccountId}`, { headers: tenantHeaders });
      if (res.ok) {
        const acc = await res.json();
        await selectAccount(acc);
      }
    } catch (err) {
      console.error('Error pre-filling credit account:', err);
    }
  }
});

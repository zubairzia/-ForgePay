window.addEventListener('DOMContentLoaded', async () => {
  const accountId = window.__creditAccountId;
  const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}/${year}`;
  };

  const formError = document.getElementById('formError');
  const showError = (message) => {
    formError.innerText = message;
    formError.classList.remove('hidden');
  };
  const clearError = () => formError.classList.add('hidden');

  document.getElementById('backLink').href = `/credit-accounts/${accountId}/view`;

  const installmentCountInput = document.getElementById('installmentCount');
  const frequencyField = document.querySelector('.installment-frequency-field');
  const syncFrequencyField = () => {
    frequencyField.style.display = Number(installmentCountInput.value) === 1 ? 'none' : '';
  };
  installmentCountInput.addEventListener('input', syncFrequencyField);
  syncFrequencyField();

  // Load current account state so the page shows what's actually being replaced.
  try {
    const res = await fetch(`/api/v1/credit-accounts/${accountId}`);
    if (!res.ok) {
      showError('Could not load this credit account.');
      return;
    }
    const account = await res.json();
    document.getElementById('currentAccountNumber').innerText = account.account_number;

    const remaining = (account.repaymentSchedule || []).filter((s) => !['paid', 'waived', 'superseded'].includes(s.due_status));
    document.getElementById('currentRemainingCount').innerText = remaining.length;
    const remainingBalance = remaining.reduce((sum, s) => {
      const due = Number(s.principal_due) + Number(s.markup_due) + Number(s.penalty_due);
      const paid = Number(s.principal_paid) + Number(s.markup_paid) + Number(s.penalty_paid);
      return sum + Math.max(0, due - paid);
    }, 0);
    document.getElementById('currentRemainingBalance').innerText = money(remainingBalance);

    if (remaining.length === 0) {
      showError('This account has no remaining installments to reschedule.');
      document.getElementById('previewBtn').disabled = true;
    }
  } catch (err) {
    console.error(err);
    showError('Could not load this credit account.');
  }

  const buildPayload = () => ({
    installmentCount: Number(installmentCountInput.value),
    installmentFrequency: document.getElementById('installmentFrequency').value,
    startDate: document.getElementById('startDate').value,
  });

  let lastPreviewedPayload = null;

  const renderPreview = (plan) => {
    document.getElementById('previewTotal').innerText = money(plan.remainingTotal);
    document.getElementById('previewPerInstallment').innerText = money(plan.remainingTotal / plan.installmentCount);
    document.getElementById('previewMaturity').innerText = formatDate(plan.schedule[plan.schedule.length - 1].dueDate);

    const body = document.getElementById('previewScheduleBody');
    body.innerHTML = '';
    plan.schedule.forEach((line) => {
      const row = body.insertRow();
      const PAD = 'px-4 py-2';
      row.insertCell(0).innerText = line.installmentNumber; row.cells[0].className = PAD;
      row.insertCell(1).innerText = formatDate(line.dueDate); row.cells[1].className = PAD;
      row.insertCell(2).innerText = money(line.principalDue); row.cells[2].className = `${PAD} text-right`;
      row.insertCell(3).innerText = money(line.markupDue); row.cells[3].className = `${PAD} text-right`;
      row.insertCell(4).innerText = money(line.penaltyDue); row.cells[4].className = `${PAD} text-right`;
      row.insertCell(5).innerText = money(line.totalDue); row.cells[5].className = `${PAD} text-right`;
    });

    document.getElementById('supersededList').innerText = plan.supersededInstallmentNumbers.length > 0
      ? `Installment #${plan.supersededInstallmentNumbers.join(', #')}`
      : 'None';

    document.getElementById('previewPanel').classList.remove('hidden');
  };

  document.getElementById('previewBtn').addEventListener('click', async () => {
    clearError();
    const payload = buildPayload();
    if (!payload.startDate) {
      showError('New start date is required.');
      return;
    }
    try {
      const res = await fetch(`/api/v1/credit-accounts/${accountId}/reschedule/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const plan = await res.json();
      if (!res.ok) {
        showError(plan.message || 'Could not preview reschedule.');
        return;
      }
      lastPreviewedPayload = payload;
      renderPreview(plan);
    } catch (err) {
      console.error(err);
      showError('Could not preview reschedule.');
    }
  });

  document.getElementById('confirmBtn').addEventListener('click', async () => {
    clearError();
    const payload = buildPayload();
    // Re-run preview server-side as the actual reschedule -- same function,
    // so this can't drift from what was just shown -- but guard against a
    // stale preview if the form changed after Preview was clicked.
    if (!lastPreviewedPayload || JSON.stringify(lastPreviewedPayload) !== JSON.stringify(payload)) {
      showError('The form changed since you last previewed. Please preview again before confirming.');
      return;
    }
    try {
      const res = await fetch(`/api/v1/credit-accounts/${accountId}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) {
        showError(result.message || 'Could not reschedule this account.');
        return;
      }
      window.location.href = `/credit-accounts/${accountId}/view`;
    } catch (err) {
      console.error(err);
      showError('Could not reschedule this account.');
    }
  });
});

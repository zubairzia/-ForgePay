// Shared dynamic line-item add/remove + live total calculation, used by
// both views/documents/create.ejs and views/documents/edit.ejs. The
// server (services/Documents/localService.js) is the actual source of
// truth for totals — this is a live preview only, computed the same way
// so it matches what the server will calculate.
window.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('lineItemsBody');
  const addBtn = document.getElementById('addLineBtn');
  const subtotalEl = document.getElementById('previewSubtotal');
  const taxTotalEl = document.getElementById('previewTaxTotal');
  const totalEl = document.getElementById('previewTotal');
  if (!tbody || !addBtn) return; // not on a page with a line-items table

  const itemsDataEl = document.getElementById('itemsData');
  const items = itemsDataEl ? JSON.parse(itemsDataEl.textContent) : [];

  let rowIndex = tbody.querySelectorAll('tr').length;

  const itemOptions = items.map(i =>
    `<option value="${i.id}" data-price="${i.sales_price || 0}" data-tax="${i.tax_rate || 0}" data-description="${(i.name || '').replace(/"/g, '&quot;')}">${i.item_code} — ${i.name}</option>`
  ).join('');

  function buildRow(index, line) {
    line = line || {};
    const tr = document.createElement('tr');
    tr.className = 'line-item-row border-b';
    tr.innerHTML = `
      <td class="p-2">
        <select name="lines[${index}][itemId]" class="line-item-select border rounded p-1.5 w-full text-sm">
          <option value="">— custom —</option>
          ${itemOptions}
        </select>
      </td>
      <td class="p-2">
        <input type="text" name="lines[${index}][description]" value="${line.description || ''}" placeholder="Description" class="line-description border rounded p-1.5 w-full text-sm">
      </td>
      <td class="p-2">
        <input type="number" step="0.01" min="0" name="lines[${index}][quantity]" value="${line.quantity || 1}" class="line-quantity border rounded p-1.5 w-20 text-sm">
      </td>
      <td class="p-2">
        <input type="number" step="0.01" min="0" name="lines[${index}][unitPrice]" value="${line.unit_price || ''}" class="line-unit-price border rounded p-1.5 w-24 text-sm">
      </td>
      <td class="p-2">
        <input type="number" step="0.01" min="0" max="100" name="lines[${index}][discountPercent]" value="${line.discount_percent || 0}" class="line-discount border rounded p-1.5 w-20 text-sm">
      </td>
      <td class="p-2">
        <input type="number" step="0.01" min="0" name="lines[${index}][taxRate]" value="${line.tax_rate || 0}" class="line-tax border rounded p-1.5 w-20 text-sm">
      </td>
      <td class="p-2 text-right text-sm font-medium line-row-total">0.00</td>
      <td class="p-2 text-center">
        <button type="button" class="remove-line-btn text-red-500 hover:text-red-700" title="Remove line">✕</button>
      </td>
    `;

    if (line.item_id) {
      const select = tr.querySelector('.line-item-select');
      select.value = line.item_id;
    }

    return tr;
  }

  function reindexRows() {
    tbody.querySelectorAll('tr.line-item-row').forEach((row, i) => {
      row.querySelectorAll('[name^="lines["]').forEach(input => {
        input.name = input.name.replace(/lines\[\d+\]/, `lines[${i}]`);
      });
    });
    rowIndex = tbody.querySelectorAll('tr').length;
  }

  function computeRowTotal(row) {
    const quantity = parseFloat(row.querySelector('.line-quantity').value) || 0;
    const unitPrice = parseFloat(row.querySelector('.line-unit-price').value) || 0;
    const discountPercent = parseFloat(row.querySelector('.line-discount').value) || 0;
    const taxRate = parseFloat(row.querySelector('.line-tax').value) || 0;

    const lineSubtotal = quantity * unitPrice * (1 - discountPercent / 100);
    const lineTax = lineSubtotal * (taxRate / 100);
    row.querySelector('.line-row-total').textContent = (lineSubtotal + lineTax).toFixed(2);

    return { lineSubtotal, lineTax };
  }

  function recomputeAll() {
    let subtotal = 0;
    let taxTotal = 0;
    tbody.querySelectorAll('tr.line-item-row').forEach(row => {
      const { lineSubtotal, lineTax } = computeRowTotal(row);
      subtotal += lineSubtotal;
      taxTotal += lineTax;
    });
    if (subtotalEl) subtotalEl.textContent = subtotal.toFixed(2);
    if (taxTotalEl) taxTotalEl.textContent = taxTotal.toFixed(2);
    if (totalEl) totalEl.textContent = (subtotal + taxTotal).toFixed(2);
  }

  addBtn.addEventListener('click', () => {
    const row = buildRow(rowIndex);
    tbody.appendChild(row);
    rowIndex += 1;
  });

  tbody.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-line-btn')) {
      const rows = tbody.querySelectorAll('tr.line-item-row');
      if (rows.length <= 1) return; // always keep at least one row
      e.target.closest('tr').remove();
      reindexRows();
      recomputeAll();
    }
  });

  tbody.addEventListener('input', (e) => {
    if (e.target.matches('.line-quantity, .line-unit-price, .line-discount, .line-tax')) {
      recomputeAll();
    }
  });

  tbody.addEventListener('change', (e) => {
    if (e.target.classList.contains('line-item-select')) {
      const option = e.target.selectedOptions[0];
      const row = e.target.closest('tr');
      if (option && option.value) {
        row.querySelector('.line-unit-price').value = option.dataset.price || 0;
        row.querySelector('.line-tax').value = option.dataset.tax || 0;
        const descInput = row.querySelector('.line-description');
        if (!descInput.value) descInput.value = option.dataset.description || '';
      }
      recomputeAll();
    }
  });

  // Initial calc for any rows already rendered server-side (edit page).
  recomputeAll();

  window.__documentsFormAddRow = (line) => {
    const row = buildRow(rowIndex, line);
    tbody.appendChild(row);
    rowIndex += 1;
  };
});

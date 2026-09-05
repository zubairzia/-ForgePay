window.addEventListener('DOMContentLoaded', async () => {
  const table = document.getElementById('itemsTable');
  const searchInput = document.getElementById('itemSearch');

  // TEMPORARY: hardcoded tenant header until real login/session exists,
  // same as public/js/customers.js.
  const tenantHeaders = { 'X-Tenant-Id': '1' };

  const populateTable = (items) => {
    table.innerHTML = '';

    if (!Array.isArray(items) || items.length === 0) {
      const row = table.insertRow();
      const cell = row.insertCell(0);
      cell.colSpan = 6;
      cell.innerText = 'No items found';
      cell.className = 'text-center text-gray-500';
      return;
    }

    items.forEach(item => {
      const row = table.insertRow();
      row.insertCell(0).innerText = item.item_code || '-';
      row.insertCell(1).innerText = item.name || '-';
      row.insertCell(2).innerText = item.item_type || '-';
      row.insertCell(3).innerText = item.sales_price != null ? item.sales_price : '-';
      row.insertCell(4).innerText = item.purchase_price != null ? item.purchase_price : '-';
      row.insertCell(5).innerText = item.is_active ? 'Yes' : 'No';

      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        window.location.href = `/items/${item.id}/view`;
      });
    });
  };

  try {
    const res = await fetch('/api/v1/items', { headers: tenantHeaders });
    const items = await res.json();
    populateTable(Array.isArray(items) ? items : []);
  } catch (err) {
    console.error('Error fetching items:', err);
  }

  let timeout = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(timeout);
    const query = searchInput.value.trim();

    timeout = setTimeout(async () => {
      try {
        let url = '/api/v1/items';
        if (query) {
          url = `/api/v1/items/search?query=${encodeURIComponent(query)}`;
        }
        const res = await fetch(url, { headers: tenantHeaders });
        const items = await res.json();
        populateTable(Array.isArray(items) ? items : []);
      } catch (err) {
        console.error('Item search error:', err);
      }
    }, 300);
  });
});

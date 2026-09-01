window.addEventListener('DOMContentLoaded', async () => {
    // TEMPORARY: hardcoded tenant header until real login/session exists,
    // same as public/js/customers.js.
    const tenantHeaders = { 'X-Tenant-Id': '1' };

    try {
      const res = await fetch('/api/v1/vendors', { headers: tenantHeaders });
      const vendors = await res.json();

      const table = document.getElementById('vendorsTable');
      table.innerHTML = ''; // Clear table

      if (!Array.isArray(vendors) || vendors.length === 0) {
        const row = table.insertRow();
        const cell = row.insertCell(0);
        cell.colSpan = 5;
        cell.innerText = 'No vendors found';
        cell.className = 'text-center text-gray-500';
        return;
      }

      vendors.forEach(c => {
        const row = table.insertRow();
        row.insertCell(0).innerText = c.vendor_code || '-';
        row.insertCell(1).innerText = c.company_name || '-';
        row.insertCell(2).innerText = `${c.first_name || ''} ${c.last_name || ''}`;
        row.insertCell(3).innerText = c.email || '-';
        row.insertCell(4).innerText = c.status || '-';
      });
    } catch (err) {
      console.error('Error fetching vendors:', err);
    }
  });

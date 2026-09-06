// Shared between customers/create.ejs and customers/edit.ejs. VAT
// registration number and CR number are only mandatory for business
// customers (individuals borrowing on installments have a national ID, not
// a commercial registration) — server-side is the actual enforcement (HTML
// `required` is trivially bypassed), this just gives immediate feedback.
window.addEventListener('DOMContentLoaded', () => {
  const customerType = document.getElementById('customerType');
  const vat = document.getElementById('vatRegistrationNumber');
  const cr = document.getElementById('crNumber');
  const vatMark = document.getElementById('vatRequiredMark');
  const crMark = document.getElementById('crRequiredMark');
  if (!customerType || !vat || !cr) return;

  const sync = () => {
    const isBusiness = customerType.value === 'business';
    vat.required = isBusiness;
    cr.required = isBusiness;
    if (vatMark) vatMark.classList.toggle('hidden', !isBusiness);
    if (crMark) crMark.classList.toggle('hidden', !isBusiness);
  };

  customerType.addEventListener('change', sync);
  sync();
});

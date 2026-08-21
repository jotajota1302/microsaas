-- The address the buyer actually typed into Stripe's payment form, when it is
-- not the one they typed into ours. A typo in the order form used to lose the
-- customer for good: the book, the link and every reminder went to nobody.
-- Stripe's is better evidence — the receipt reached it seconds earlier.
alter table cuentos.orders add column if not exists paid_email text;

comment on column cuentos.orders.paid_email is
  'Email from Stripe customer_details when it differs from orders.email. Delivery goes to both.';

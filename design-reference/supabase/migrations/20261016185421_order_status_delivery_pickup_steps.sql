alter type public.order_status add value if not exists 'driver_assigned' after 'ready';
alter type public.order_status add value if not exists 'picked_up' after 'driver_assigned';
alter type public.order_status add value if not exists 'delivered' after 'out_for_delivery';
alter type public.order_status add value if not exists 'collected' after 'delivered';

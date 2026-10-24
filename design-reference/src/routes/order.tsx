import { createFileRoute, redirect } from "@tanstack/react-router";

// "Order Now" goes straight to the menu, where Delivery / Pickup / Dine-in is chosen.
// This keeps old /order links working.
export const Route = createFileRoute("/order")({
  beforeLoad: () => {
    throw redirect({ to: "/menu", replace: true });
  },
});

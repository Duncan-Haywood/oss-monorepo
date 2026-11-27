// e2e-only secret: the server runs on localhost with throwaway local data. The upgrade spec signs a
// checkout token with it, as the worker does, so the fake provider's webhook can name the checkout.
export const E2E_AUTH_SECRET = "e2e-only-auth-secret-0123456789abcdef0123456789";

/**
 * Convenience hook for auth state.
 * Wraps useAuthStore to avoid importing the store directly in every component.
 */
export { useAuthStore as useAuth } from '@/store/authStore';

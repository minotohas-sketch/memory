import { z } from 'zod';

// Formule de validation ho an'ny FaucetPay Email
export const withdrawSchema = z.object({
  amount: z.number().positive("Ny vola alaina dia tokony ho mihoatra ny 0"),
  address: z.string().email("Mampidira adiresy email FaucetPay marina azafady"),
  currency: z.string().default("USDT"),
});

export type WithdrawRequest = z.infer<typeof withdrawSchema>;

// Fijerena raha tena email marina
export function isValidFaucetPayEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

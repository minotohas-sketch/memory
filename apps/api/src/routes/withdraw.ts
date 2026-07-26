import { Hono } from 'hono';
import { isValidFaucetPayEmail, withdrawSchema } from '@memory-match/shared';
import { sendFaucetPayPayout } from '../lib/faucetpay';
import { requireAuth } from '../middleware/auth'; // Raha misy middleware fanaovanao authentication

const withdrawRouter = new Hono();

withdrawRouter.post('/', requireAuth, async (c) => {
  try {
    const body = await c.req.json();
    
    // Fanamarinana ny format nampidirina
    const parsed = withdrawSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Mari-bola na Email tsy mety' }, 400);
    }

    const { amount, address: faucetpayEmail } = parsed.data;

    // Fanamarinana fanampiny raha tena email
    if (!isValidFaucetPayEmail(faucetpayEmail)) {
      return c.json({ error: 'Mila adiresy email FaucetPay marina' }, 400);
    }

    // Atao eto ny logic manala ny balance an'ny mpampiasa ao amin'ny DB
    // Ohatra: await db.users.deductBalance(userId, amount);

    // Alefa any amin'ny FaucetPay
    const result = await sendFaucetPayPayout(c.env, {
      to: faucetpayEmail,
      amount: amount,
      currency: 'USDT', // Na ny crypto ampiasainao
    });

    return c.json({ success: true, message: 'Lasa ny vola!', result });
  } catch (err: any) {
    console.error('Withdraw Error:', err);
    return c.json({ error: err.message || 'Nisy olana teknika nandritra ny fandefasana.' }, 500);
  }
});

export default withdrawRouter;

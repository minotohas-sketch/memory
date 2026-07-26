export interface FaucetPayPayoutParams {
  to: string; // Eto no miditra ilay Email FaucetPay
  amount: number;
  currency: string;
}

export async function sendFaucetPayPayout(
  env: any, // Env ahitana ny API Key
  params: FaucetPayPayoutParams
) {
  if (!env.FAUCETPAY_API_KEY) {
    throw new Error('Tsy hita ny FAUCETPAY_API_KEY ao amin\'ny configuration');
  }

  const formData = new FormData();
  formData.append('api_key', env.FAUCETPAY_API_KEY);
  formData.append('to', params.to);
  formData.append('amount', params.amount.toString());
  formData.append('currency', params.currency);
  formData.append('referral', 'false'); // Na arakaraka ny filànao

  const response = await fetch('https://faucetpay.io/api/v1/send', {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();

  if (data.status !== 200) {
    throw new Error(data.message || 'Tsy nety ny nandefa ny vola tany amin\'ny FaucetPay');
  }

  return data;
}

import React, { useState } from 'react';
import { isValidFaucetPayEmail } from '@memory-match/shared';

export const WithdrawScreen: React.FC = () => {
  const [faucetpayEmail, setFaucetpayEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isValidFaucetPayEmail(faucetpayEmail)) {
      setError("Mampidira adiresy email FaucetPay marina azafady.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          address: faucetpayEmail.trim(), // Nalefa any amin'ny backend ilay email
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Nisy olana ny fangatahanao');

      alert('Tafiditra soa aman-tsara any amin\'ny FaucetPay ny fangatahanao!');
      setFaucetpayEmail('');
      setAmount('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-xl shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Retrait FaucetPay</h2>
      <form onSubmit={handleWithdraw} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold mb-2 text-gray-700">
            Adiresy Email FaucetPay
          </label>
          <input
            type="email"
            value={faucetpayEmail}
            onChange={(e) => setFaucetpayEmail(e.target.value)}
            placeholder="ohatra@gmail.com"
            required
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2 text-gray-700">
            Mari-bola (USDT)
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.50"
            required
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loading ? 'Mikirakira...' : 'Alefa ny Retrait'}
        </button>
      </form>
    </div>
  );
};

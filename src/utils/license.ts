import { licenseStorage } from './storage';

const LEMON_SQUEEZY_VALIDATE_URL = 'https://api.lemonsqueezy.com/v1/licenses/validate';

// TODO: Replace with your LemonSqueezy store slug after creating a product
const STORE_URL = 'https://tabvault.lemonsqueezy.com/buy';

export function getStoreUrl(): string {
  return STORE_URL;
}

export async function isProUser(): Promise<boolean> {
  const license = await licenseStorage.getValue();
  return license.isPro;
}

export async function activateLicense(key: string): Promise<{ success: boolean; error?: string }> {
  const trimmedKey = key.trim();
  if (!trimmedKey) return { success: false, error: 'Please enter a license key' };

  try {
    const response = await fetch(LEMON_SQUEEZY_VALIDATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ license_key: trimmedKey, instance_name: 'TabVault Chrome Extension' }),
    });

    const data = await response.json();

    if (!data.valid) {
      const reason = data.license_key?.status;
      if (reason === 'expired') return { success: false, error: 'This license has expired' };
      if (reason === 'disabled') return { success: false, error: 'This license has been disabled' };
      return { success: false, error: 'Invalid license key' };
    }

    await licenseStorage.setValue({
      isPro: true,
      licenseKey: trimmedKey,
      activatedAt: new Date().toISOString(),
    });

    return { success: true };
  } catch {
    return { success: false, error: 'Network error — please check your connection and try again' };
  }
}

export async function deactivateLicense(): Promise<void> {
  const license = await licenseStorage.getValue();
  if (license.licenseKey) {
    try {
      await fetch('https://api.lemonsqueezy.com/v1/licenses/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ license_key: license.licenseKey, instance_name: 'TabVault Chrome Extension' }),
      });
    } catch {
      // Best-effort deactivation
    }
  }

  await licenseStorage.setValue({
    isPro: false,
    licenseKey: null,
    activatedAt: null,
  });
}

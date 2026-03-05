import { licenseStorage } from './storage';

const LICENSE_PATTERN = /^TV-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export async function isProUser(): Promise<boolean> {
  const license = await licenseStorage.getValue();
  return license.isPro;
}

export async function activateLicense(key: string): Promise<boolean> {
  if (!LICENSE_PATTERN.test(key)) return false;

  await licenseStorage.setValue({
    isPro: true,
    licenseKey: key,
    activatedAt: new Date().toISOString(),
  });
  return true;
}

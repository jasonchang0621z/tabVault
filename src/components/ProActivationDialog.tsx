import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { activateLicense } from '../utils/license';

interface Props {
  onActivated: () => void;
  onCancel: () => void;
}

export function ProActivationDialog({ onActivated, onCancel }: Props) {
  const [key, setKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || activating) return;
    setError('');
    setActivating(true);
    try {
      const success = await activateLicense(key.trim().toUpperCase());
      if (success) {
        onActivated();
      } else {
        setError('Invalid license key. Format: TV-XXXX-XXXX-XXXX');
      }
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl mx-4 p-4 w-full max-w-[320px]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Activate Pro</h3>
          <button onClick={onCancel} className="p-1 hover:bg-gray-100 rounded-md transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="TV-XXXX-XXXX-XXXX"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-1 font-mono"
            autoFocus
          />
          {error && (
            <p className="text-xs text-red-500 mb-2">{error}</p>
          )}
          <div className="flex gap-2 justify-end mt-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!key.trim() || activating}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {activating ? 'Activating...' : 'Activate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

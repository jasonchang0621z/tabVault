import { CheckCircle, XCircle, X } from 'lucide-react';
import type { Toast as ToastType } from '../hooks/useToast';

interface Props {
  toast: ToastType;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: Props) {
  const isSuccess = toast.type === 'success';

  return (
    <div
      className={`fixed bottom-3 left-3 right-3 flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-sm text-white ${
        isSuccess ? 'bg-green-600' : 'bg-red-600'
      }`}
    >
      {isSuccess ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
      <span className="flex-1">{toast.message}</span>
      <button onClick={onDismiss} className="p-0.5 hover:opacity-80">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

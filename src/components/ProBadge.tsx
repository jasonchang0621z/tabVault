interface Props {
  count: number;
  limit: number | null;
  onUnlockPro: () => void;
}

export function ProBadge({ count, limit, onUnlockPro }: Props) {
  if (limit === null) return null;

  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-gray-50">
      <span className="text-[10px] text-gray-400">
        {count}/{limit} workspaces
      </span>
      <button
        className="text-[10px] text-blue-600 hover:text-blue-700 font-medium"
        onClick={onUnlockPro}
      >
        Unlock Pro
      </button>
    </div>
  );
}
